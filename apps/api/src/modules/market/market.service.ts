import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef, Logger } from '@nestjs/common';
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
  DEFAULT_SYMBOLS,
} from '@crypto-screener/shared';
import { DatabaseService } from '../../database/database.service';
import { MarketGateway } from './market.gateway';

export interface TickerWithMeta extends Ticker {
  volatility: number;
  atr: number;
}

const REDIS_TICKER_PREFIX = 'ticker:';
const EXCHANGE_HEALTH_KEY = 'exchange:health';

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private exchangeManager!: ExchangeManager;

  private tickerCache = new Map<string, TickerWithMeta>();
  private candleCache = new Map<string, Candle[]>();
  private orderbookCache = new Map<string, OrderBook>();

  private connectedExchanges = new Set<ExchangeId>();
  private subscribedSymbols = new Set<string>();
  private symbolSubscriptionRefs = new Map<string, number>();
  private subscribedCandles = new Map<string, { symbol: string; timeframe: Timeframe; exchange?: ExchangeId }>();
  private candleSubscriptionRefs = new Map<string, number>();

  private tickerThrottle = new Map<string, number>();
  private readonly THROTTLE_MS = 100;

  private exchangeHealth = new Map<ExchangeId, {
    connected: boolean;
    lastSeen: number;
    reconnects: number;
    errors: number;
  }>();

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => MarketGateway)) private readonly gateway: MarketGateway,
  ) {}

  async onModuleInit() {
    this.exchangeManager = new ExchangeManager();
    this.exchangeManager.on('ticker', (ticker: Ticker) => this.handleTicker(ticker));
    this.exchangeManager.on('candle', (candle: Candle) => this.handleCandle(candle));
    this.exchangeManager.on('orderbook', (ob: OrderBook) => this.handleOrderBook(ob));
    this.exchangeManager.on('trade', (trade: Trade) => this.handleTrade(trade));
    
    this.exchangeManager.on('exchange_connected', (id: ExchangeId) => {
      this.connectedExchanges.add(id);
      this.updateExchangeHealth(id, true);
      this.logger.log(`✅ ${id} connected`);
      for (const symbol of this.subscribedSymbols) {
        this.exchangeManager.subscribeTicker(symbol, [id]);
        this.exchangeManager.subscribeTrades(symbol, [id]);
      }
      for (const sub of this.subscribedCandles.values()) {
        if (!sub.exchange || sub.exchange === id) {
          this.exchangeManager.subscribeCandle(sub.symbol, sub.timeframe, [id]);
          this.exchangeManager.subscribeTrades(sub.symbol, [id]);
        }
      }
    });

    this.exchangeManager.on('exchange_disconnected', (id: ExchangeId) => {
      this.connectedExchanges.delete(id);
      this.updateExchangeHealth(id, false);
      this.logger.warn(`❌ ${id} disconnected`);
    });

    await this.exchangeManager.connectAll();
    await this.loadInitialTickers();

    for (const symbol of DEFAULT_SYMBOLS.slice(0, 20)) {
      this.subscribeSymbol(symbol);
    }
  }

  onModuleDestroy() {
    this.exchangeManager.disconnectAll();
  }

  private updateExchangeHealth(id: ExchangeId, connected: boolean): void {
    const existing = this.exchangeHealth.get(id) || { connected: false, lastSeen: 0, reconnects: 0, errors: 0 };
    this.exchangeHealth.set(id, {
      connected,
      lastSeen: connected ? Date.now() : existing.lastSeen,
      reconnects: !existing.connected && connected ? existing.reconnects + 1 : existing.reconnects,
      errors: existing.errors,
    });
  }

  private async loadInitialTickers() {
    try {
      const tickers = await this.exchangeManager.fetchAllTickers();
      for (const ticker of tickers) {
        const key = `${ticker.exchange}:${ticker.symbol}`;
        this.tickerCache.set(key, { ...ticker, volatility: 0, atr: 0 });
      }
    } catch (err) {
      this.logger.error('Failed to load initial tickers:', err);
    }
  }

  private handleTicker(ticker: Ticker) {
    const key = `${ticker.exchange}:${ticker.symbol}`;
    const existing = this.tickerCache.get(key);
    const updated: TickerWithMeta = {
      ...(existing || {
        exchange: ticker.exchange,
        marketType: ticker.marketType || 'spot',
        symbol: ticker.symbol,
        priceChange24h: 0,
        priceChangePercent24h: 0,
        volume24h: 0,
        high24h: ticker.lastPrice,
        low24h: ticker.lastPrice,
        volatility: 0,
        atr: 0,
      } as TickerWithMeta),
      ...ticker,
    };
    this.tickerCache.set(key, updated);
    const now = Date.now();
    const lastEmit = this.tickerThrottle.get(key) || 0;
    if (now - lastEmit >= this.THROTTLE_MS) {
      this.tickerThrottle.set(key, now);
      this.gateway.broadcast('ticker', updated);
    }
  }

  private handleCandle(candle: Candle) {
    // Debug futures candle flow
    if (candle.marketType === 'futures' && candle.exchange === 'binance') {
      console.log(`[handleCandle] futures candle: ${candle.symbol} ${candle.timeframe} O:${candle.open} C:${candle.close}`);
    }
    const key = `candle:${candle.symbol}:${candle.exchange}:${candle.timeframe}`;
    let candles = this.candleCache.get(key) || [];
    const idx = candles.findIndex(c => c.time === candle.time);
    if (idx >= 0) { candles[idx] = candle; } else {
      candles.push(candle);
      if (candles.length > 2000) candles = candles.slice(-2000);
    }
    this.candleCache.set(key, candles);
    this.gateway.broadcast('candle', candle);
    if (candle.isClosed) { this.storeCandle(candle).catch(() => {}); }
  }

  private handleTrade(trade: Trade) {
    const key = `${trade.exchange}:${trade.symbol}`;
    const existing = this.tickerCache.get(key);
    const updatedTicker: TickerWithMeta = {
      ...(existing || {
        exchange: trade.exchange,
        marketType: trade.marketType || 'spot',
        symbol: trade.symbol,
        priceChange24h: 0,
        priceChangePercent24h: 0,
        volume24h: 0,
        high24h: trade.price,
        low24h: trade.price,
        volatility: 0,
        atr: 0,
      } as TickerWithMeta),
      lastPrice: trade.price,
      timestamp: trade.timestamp,
    };
    this.tickerCache.set(key, updatedTicker);
    const now = Date.now();
    const lastEmit = this.tickerThrottle.get(key) || 0;
    if (now - lastEmit >= this.THROTTLE_MS) {
      this.tickerThrottle.set(key, now);
      this.gateway.broadcast('ticker', updatedTicker);
    }
    this.db.publish('trade', trade).catch(() => {});
  }

  private handleOrderBook(ob: OrderBook) {
    const key = `ob:${ob.exchange}:${ob.symbol}`;
    this.orderbookCache.set(key, ob);
    this.gateway.broadcast('orderbook', ob);
  }

  private async storeCandle(candle: Candle) {
    try {
      await this.db.query(
        `INSERT INTO candles (symbol, exchange, timeframe, timestamp, open, high, low, close, volume, trades)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (symbol, exchange, timeframe, timestamp) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume, trades = EXCLUDED.trades`,
        [candle.symbol, candle.exchange, candle.timeframe, candle.time,
         candle.open, candle.high, candle.low, candle.close, candle.volume, candle.trades || 0],
      );
    } catch { /* fail */ }
  }

  getTickers(exchange?: ExchangeId, symbols?: string[]): TickerWithMeta[] {
    let tickers = Array.from(this.tickerCache.values());
    if (exchange) tickers = tickers.filter(t => t.exchange === exchange);
    if (symbols?.length) {
      const set = new Set(symbols);
      tickers = tickers.filter(t => set.has(t.symbol));
    }
    return tickers;
  }

  getTopGainers(limit = 50): TickerWithMeta[] {
    return this.getTickers().sort((a, b) => (b.priceChangePercent24h || 0) - (a.priceChangePercent24h || 0)).slice(0, limit);
  }

  getTopLosers(limit = 50): TickerWithMeta[] {
    return this.getTickers().sort((a, b) => (a.priceChangePercent24h || 0) - (b.priceChangePercent24h || 0)).slice(0, limit);
  }

  getTopVolume(limit = 50): TickerWithMeta[] {
    return this.getTickers().sort((a, b) => b.volume24h - a.volume24h).slice(0, limit);
  }

  async getCandles(symbol: string, timeframe: Timeframe, exchange?: ExchangeId, limit = 500, endTime?: number): Promise<Candle[]> {
    const cacheKey = `candle:${symbol}:${exchange || 'all'}:${timeframe}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached?.length && !endTime) return cached.slice(-limit);
    try {
      const candles = await this.exchangeManager.fetchCandles(symbol, timeframe, exchange, limit, endTime);
      if (candles.length > 0 && !endTime) this.candleCache.set(cacheKey, candles);
      return candles;
    } catch (err) {
      return cached?.slice(-limit) || [];
    }
  }

  async getOrderBook(symbol: string, exchange?: ExchangeId): Promise<OrderBook | null> {
    if (exchange) {
      const key = `ob:${exchange}:${symbol}`;
      const cached = this.orderbookCache.get(key);
      if (cached) return cached;
    }
    return this.exchangeManager.fetchOrderBook(symbol, exchange);
  }

  getExchangeHealth(): Record<string, unknown> {
    const health: Record<string, unknown> = {};
    for (const [id, data] of this.exchangeHealth) {
      health[id] = { ...data, uptime: data.connected ? Date.now() - data.lastSeen : 0 };
    }
    return health;
  }

  getConnectedExchanges(): ExchangeId[] { return Array.from(this.connectedExchanges); }

  subscribeSymbol(symbol: string): void {
    const currentRefs = this.symbolSubscriptionRefs.get(symbol) || 0;
    this.symbolSubscriptionRefs.set(symbol, currentRefs + 1);
    if (currentRefs > 0) return;
    this.subscribedSymbols.add(symbol);
    this.exchangeManager.subscribeTicker(symbol);
    this.exchangeManager.subscribeTrades(symbol);
  }

  unsubscribeSymbol(symbol: string): void {
    const currentRefs = this.symbolSubscriptionRefs.get(symbol) || 0;
    if (currentRefs <= 1) {
      this.symbolSubscriptionRefs.delete(symbol);
      this.subscribedSymbols.delete(symbol);
      this.exchangeManager.unsubscribeTicker(symbol);
      this.exchangeManager.unsubscribeTrades(symbol);
      return;
    }
    this.symbolSubscriptionRefs.set(symbol, currentRefs - 1);
  }

  subscribeCandle(symbol: string, timeframe: Timeframe, exchange?: ExchangeId): void {
    const key = JSON.stringify([symbol, timeframe, exchange || 'all']);
    const currentRefs = this.candleSubscriptionRefs.get(key) || 0;
    this.candleSubscriptionRefs.set(key, currentRefs + 1);
    if (currentRefs > 0) return;
    this.subscribedCandles.set(key, { symbol, timeframe, exchange });
    this.exchangeManager.subscribeCandle(symbol, timeframe, exchange ? [exchange] : undefined);
    this.exchangeManager.subscribeTrades(symbol, exchange ? [exchange] : undefined);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe, exchange?: ExchangeId): void {
    const key = JSON.stringify([symbol, timeframe, exchange || 'all']);
    const currentRefs = this.candleSubscriptionRefs.get(key) || 0;
    if (currentRefs <= 1) {
      this.candleSubscriptionRefs.delete(key);
      this.subscribedCandles.delete(key);
      this.exchangeManager.unsubscribeCandle(symbol, timeframe, exchange ? [exchange] : undefined);
      this.exchangeManager.unsubscribeTrades(symbol, exchange ? [exchange] : undefined);
      return;
    }
    this.candleSubscriptionRefs.set(key, currentRefs - 1);
  }

  subscribeOrderBook(symbol: string, exchange?: ExchangeId): void {
    this.exchangeManager.subscribeOrderBook(symbol, exchange ? [exchange] : undefined);
  }

  unsubscribeOrderBook(symbol: string, exchange?: ExchangeId): void {
    this.exchangeManager.unsubscribeOrderBook(symbol, exchange ? [exchange] : undefined);
  }

  @Interval(30000)
  private async refreshTickers() {
    if (this.connectedExchanges.size === 0) return;
    try {
      const tickers = await this.exchangeManager.fetchAllTickers(Array.from(this.subscribedSymbols));
      for (const ticker of tickers) {
        const key = `${ticker.exchange}:${ticker.symbol}`;
        const existing = this.tickerCache.get(key);
        this.tickerCache.set(key, { 
          ...(existing || {}), 
          ...ticker, 
          volatility: existing?.volatility || 0, 
          atr: existing?.atr || 0 
        } as TickerWithMeta);
      }
    } catch { /* fail */ }
  }

  @Interval(60000)
  private async persistHealth() { this.db.cacheSet(EXCHANGE_HEALTH_KEY, this.getExchangeHealth(), 300).catch(() => {}); }
}
