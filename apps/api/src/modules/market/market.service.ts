import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExchangeManager } from '@crypto-screener/exchange-connectors';
import type {
  ExchangeId,
  Ticker,
  Candle,
  Timeframe,
  OrderBook,
  Trade,
} from '@crypto-screener/shared';
import {
  ALL_EXCHANGES,
  DEFAULT_SYMBOLS,
  calculateVolatility,
  calculateATR,
} from '@crypto-screener/shared';
import { DatabaseService } from '../../database/database.service';
import { MarketGateway } from './market.gateway';

export interface TickerWithMeta extends Ticker {
  volatility: number;
  atr: number;
}

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private exchangeManager!: ExchangeManager;

  // In-memory caches
  private tickerCache = new Map<string, TickerWithMeta>();
  private candleCache = new Map<string, Candle[]>();
  private orderbookCache = new Map<string, OrderBook>();

  private connectedExchanges = new Set<ExchangeId>();
  private subscribedSymbols = new Set<string>();
  private subscribedCandles = new Map<string, { symbol: string; timeframe: Timeframe; exchange?: ExchangeId }>();
  private candleSubscriptionRefs = new Map<string, number>();

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => MarketGateway)) private readonly gateway: MarketGateway,
  ) {}

  async onModuleInit() {
    this.exchangeManager = new ExchangeManager();

    // Forward events
    this.exchangeManager.on('ticker', (ticker: Ticker) => this.handleTicker(ticker));
    this.exchangeManager.on('candle', (candle: Candle & { symbol: string }) => this.handleCandle(candle));
    this.exchangeManager.on('orderbook', (ob: OrderBook) => this.handleOrderBook(ob));
    this.exchangeManager.on('trade', (trade: Trade) => this.handleTrade(trade));
    this.exchangeManager.on('exchange_connected', (id: ExchangeId) => {
      this.connectedExchanges.add(id);
      console.log(`✅ ${id} connected`);
      // Re-subscribe active symbols
      for (const symbol of this.subscribedSymbols) {
        this.exchangeManager.subscribeTicker(symbol, [id]);
      }
      for (const sub of this.subscribedCandles.values()) {
        if (!sub.exchange || sub.exchange === id) {
          this.exchangeManager.subscribeCandle(sub.symbol, sub.timeframe, [id]);
        }
      }
    });
    this.exchangeManager.on('exchange_disconnected', (id: ExchangeId) => {
      this.connectedExchanges.delete(id);
      console.log(`❌ ${id} disconnected`);
    });
    this.exchangeManager.on('exchange_error', ({ exchange, error }: { exchange: ExchangeId; error: Error }) => {
      console.error(`⚠️ ${exchange} error:`, error.message);
    });

    // Connect all exchanges
    await this.exchangeManager.connectAll();

    // Load initial tickers
    await this.loadInitialTickers();

    // Subscribe default symbols
    for (const symbol of DEFAULT_SYMBOLS.slice(0, 20)) {
      this.subscribedSymbols.add(symbol);
      this.exchangeManager.subscribeTicker(symbol);
    }

    console.log(`📊 Market service initialized. Connected: ${Array.from(this.connectedExchanges).join(', ')}`);
  }

  onModuleDestroy() {
    this.exchangeManager.disconnectAll();
  }

  private async loadInitialTickers() {
    try {
      const tickers = await this.exchangeManager.fetchAllTickers();
      for (const ticker of tickers) {
        const key = `${ticker.exchange}:${ticker.symbol}`;
        this.tickerCache.set(key, {
          ...ticker,
          volatility: 0,
          atr: 0,
        });
      }
      console.log(`📈 Loaded ${tickers.length} initial tickers`);
    } catch (err) {
      console.error('Failed to load initial tickers:', err);
    }
  }

  private handleTicker(ticker: Ticker) {
    const key = `${ticker.exchange}:${ticker.symbol}`;
    const existing = this.tickerCache.get(key);
    this.tickerCache.set(key, {
      ...ticker,
      volatility: existing?.volatility || 0,
      atr: existing?.atr || 0,
    });

    // Publish to Redis for WebSocket relay
    this.db.publish('ticker', ticker);
    this.gateway?.broadcastTicker(ticker);
  }

  private handleCandle(candle: Candle & { symbol: string; exchange?: ExchangeId; timeframe?: Timeframe; finalized?: boolean }) {
    const key = `candle:${candle.symbol}:${candle.exchange || 'unknown'}:${candle.timeframe || 'unknown'}`;
    let candles = this.candleCache.get(key) || [];
    
    // Update or add candle
    const idx = candles.findIndex(c => c.timestamp === candle.timestamp);
    if (idx >= 0) {
      candles[idx] = candle;
    } else {
      candles.push(candle);
      // Keep max 5000 candles in memory
      if (candles.length > 5000) candles = candles.slice(-5000);
    }
    this.candleCache.set(key, candles);

    // Store finalized candles in DB
    if (candle.finalized) {
      this.storeCandle(candle).catch(() => {});
    }

    this.db.publish('candle', candle);
    // Broadcast to Socket.IO subscribers
    this.gateway?.broadcastCandle(candle);
  }

  private handleOrderBook(ob: OrderBook) {
    const key = `ob:${ob.exchange}:${ob.symbol}`;
    this.orderbookCache.set(key, ob);
    this.db.publish('orderbook', ob);
  }

  private handleTrade(trade: Trade) {
    this.db.publish('trade', trade);
  }

  private async storeCandle(candle: Candle & { symbol: string; exchange?: ExchangeId; timeframe?: Timeframe }) {
    try {
      await this.db.query(
        `INSERT INTO candles (symbol, exchange, timeframe, timestamp, open, high, low, close, volume, trades)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (symbol, exchange, timeframe, timestamp) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume, trades = EXCLUDED.trades`,
        [candle.symbol, candle.exchange || 'binance', candle.timeframe || '1m', candle.timestamp,
         candle.open, candle.high, candle.low, candle.close, candle.volume, candle.trades],
      );
    } catch {
      // Silent fail for candle storage
    }
  }

  // Public API methods

  getTickers(exchange?: ExchangeId, symbols?: string[]): TickerWithMeta[] {
    let tickers = Array.from(this.tickerCache.values());

    if (exchange) {
      tickers = tickers.filter(t => t.exchange === exchange);
    }

    if (symbols?.length) {
      const set = new Set(symbols);
      tickers = tickers.filter(t => set.has(t.symbol));
    }

    return tickers;
  }

  getTopGainers(limit = 50): TickerWithMeta[] {
    return this.getTickers()
      .sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h)
      .slice(0, limit);
  }

  getTopLosers(limit = 50): TickerWithMeta[] {
    return this.getTickers()
      .sort((a, b) => a.priceChangePercent24h - b.priceChangePercent24h)
      .slice(0, limit);
  }

  getTopVolume(limit = 50): TickerWithMeta[] {
    return this.getTickers()
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
      .slice(0, limit);
  }

  getTopTrades(limit = 50): TickerWithMeta[] {
    return this.getTickers()
      .sort((a, b) => b.trades24h - a.trades24h)
      .slice(0, limit);
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    exchange?: ExchangeId,
    limit = 500,
    endTime?: number,
  ): Promise<Candle[]> {
    // Cache key includes timeframe to avoid returning wrong candles on TF switch
    const cacheKey = `candle:${symbol}:${exchange || 'all'}:${timeframe}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached?.length && !endTime) {
      return cached.slice(-limit);
    }

    // Fetch from exchange
    try {
      const candles = await this.exchangeManager.fetchCandles(symbol, timeframe, exchange, limit, endTime);
      if (candles.length > 0 && !endTime) {
        // Only cache recent candles, not historical pagination results
        this.candleCache.set(cacheKey, candles);
      }
      return candles;
    } catch (err) {
      console.error(`Failed to fetch candles for ${symbol}:`, err);
      return cached?.slice(-limit) || [];
    }
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    exchange: ExchangeId,
    startTime: number,
    endTime: number,
  ): Promise<Candle[]> {
    // Try database first
    try {
      const result = await this.db.query<Candle>(
        `SELECT timestamp, open, high, low, close, volume, trades
         FROM candles
         WHERE symbol = $1 AND exchange = $2 AND timeframe = $3
           AND timestamp >= $4 AND timestamp <= $5
         ORDER BY timestamp ASC`,
        [symbol, exchange, timeframe, startTime, endTime],
      );
      if (result.rows.length > 0) return result.rows;
    } catch { /* fallback to exchange */ }

    // Fetch from exchange
    return this.exchangeManager.fetchCandles(symbol, timeframe, exchange, 1000);
  }

  async getOrderBook(symbol: string, exchange?: ExchangeId): Promise<OrderBook | null> {
    if (exchange) {
      const key = `ob:${exchange}:${symbol}`;
      const cached = this.orderbookCache.get(key);
      if (cached) return cached;
    }

    return this.exchangeManager.fetchOrderBook(symbol, exchange);
  }

  subscribeSymbol(symbol: string): void {
    this.subscribedSymbols.add(symbol);
    this.exchangeManager.subscribeTicker(symbol);
  }

  subscribeCandle(symbol: string, timeframe: Timeframe, exchange?: ExchangeId): void {
    const key = JSON.stringify([symbol, timeframe, exchange || 'all']);
    const currentRefs = this.candleSubscriptionRefs.get(key) || 0;
    this.candleSubscriptionRefs.set(key, currentRefs + 1);
    if (currentRefs > 0) return;

    this.subscribedCandles.set(key, { symbol, timeframe, exchange });
    this.exchangeManager.subscribeCandle(symbol, timeframe, exchange ? [exchange] : undefined);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe, exchange?: ExchangeId): void {
    const key = JSON.stringify([symbol, timeframe, exchange || 'all']);
    const currentRefs = this.candleSubscriptionRefs.get(key) || 0;
    if (currentRefs <= 1) {
      this.candleSubscriptionRefs.delete(key);
      this.subscribedCandles.delete(key);
      this.exchangeManager.unsubscribeCandle(symbol, timeframe, exchange ? [exchange] : undefined);
      return;
    }

    this.candleSubscriptionRefs.set(key, currentRefs - 1);
  }

  unsubscribeSymbol(symbol: string): void {
    this.subscribedSymbols.delete(symbol);
    this.exchangeManager.unsubscribeTicker(symbol);
  }

  getConnectedExchanges(): ExchangeId[] {
    return Array.from(this.connectedExchanges);
  }

  // Refresh tickers periodically
  @Interval(30000)
  private async refreshTickers() {
    if (this.connectedExchanges.size === 0) return;
    
    try {
      const tickers = await this.exchangeManager.fetchAllTickers(
        Array.from(this.subscribedSymbols),
      );
      for (const ticker of tickers) {
        const key = `${ticker.exchange}:${ticker.symbol}`;
        const existing = this.tickerCache.get(key);
        this.tickerCache.set(key, {
          ...ticker,
          volatility: existing?.volatility || 0,
          atr: existing?.atr || 0,
        });
      }
    } catch {
      // Silent fail
    }
  }
}
