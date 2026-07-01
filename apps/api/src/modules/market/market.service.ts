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
  ALL_EXCHANGES,
  DEFAULT_SYMBOLS,
  normalizeSymbol,
  timeframeToMs,
} from '@crypto-screener/shared';
import { DatabaseService } from '../../database/database.service';
import { MarketGateway } from './market.gateway';
import { AlertsService } from '../alerts/alerts.service';

export interface TickerWithMeta extends Ticker {
  volatility: number;
  atr: number;
}

const REDIS_TICKER_PREFIX = 'ticker:';
const EXCHANGE_HEALTH_KEY = 'exchange:health';

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private readonly MAX_CANDLE_CACHE = 20000;
  private exchangeManager!: ExchangeManager;

  private tickerCache = new Map<string, TickerWithMeta>();
  private candleCache = new Map<string, Candle[]>();
  private orderbookCache = new Map<string, OrderBook>();

  private connectedExchanges = new Set<ExchangeId>();
  private subscribedSymbols = new Set<string>();
  private symbolSubscriptionRefs = new Map<string, number>();
  private subscribedCandles = new Map<string, { symbol: string; timeframe: Timeframe; exchange?: ExchangeId }>();
  private candleSubscriptionRefs = new Map<string, number>();
  private orderBookSubscriptionRefs = new Map<string, number>();

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
    private readonly alertsService: AlertsService,
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
      }
      for (const sub of this.subscribedCandles.values()) {
        if (!sub.exchange || sub.exchange === id) {
          this.exchangeManager.subscribeCandle(sub.symbol, sub.timeframe, [id]);
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

    for (const symbol of DEFAULT_SYMBOLS) {
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
    
    // Check for price alerts/signals on every ticker update
    this.alertsService.checkPriceSignals(updated);

    const now = Date.now();
    const lastEmit = this.tickerThrottle.get(key) || 0;
    if (now - lastEmit >= this.THROTTLE_MS) {
      this.tickerThrottle.set(key, now);
      this.gateway.broadcast('ticker', updated);
    }
  }

  private handleCandle(candle: Candle) {
    const key = `candle:${candle.symbol}:${candle.exchange}:${candle.timeframe}`;
    let candles = this.candleCache.get(key) || [];
    const idx = candles.findIndex(c => c.time === candle.time);
    if (idx >= 0) { candles[idx] = candle; } else {
      candles.push(candle);
      if (candles.length > this.MAX_CANDLE_CACHE) candles = candles.slice(-this.MAX_CANDLE_CACHE);
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

    // Check for price alerts/signals on every trade update
    this.alertsService.checkPriceSignals(updatedTicker);

    const now = Date.now();
    const lastEmit = this.tickerThrottle.get(key) || 0;
    if (now - lastEmit >= this.THROTTLE_MS) {
      this.tickerThrottle.set(key, now);
      this.gateway.broadcast('ticker', updatedTicker);
    }
    this.db.publish('trade', trade).catch(() => {});
  }

  private handleOrderBook(ob: OrderBook) {
    const key = `ob:${ob.exchange}:${ob.marketType ?? 'spot'}:${ob.symbol}`;
    this.orderbookCache.set(key, ob);
    this.gateway.broadcast('orderbook', ob);
  }

  private async storeCandle(candle: Candle) {
    try {
      await this.db.query(
        `INSERT INTO candles (symbol, exchange, timeframe, time, open, high, low, close, volume, trades)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (symbol, exchange, timeframe, time) DO UPDATE SET
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

  getLatestTicker(symbol: string, exchange?: ExchangeId): TickerWithMeta | null {
    if (exchange) {
      return this.tickerCache.get(`${exchange}:${symbol}`) || null;
    }

    for (const ticker of this.tickerCache.values()) {
      if (ticker.symbol === symbol) return ticker;
    }
    return null;
  }

  getLatestCandle(symbol: string, timeframe: Timeframe, exchange?: ExchangeId): Candle | null {
    const cacheKey = `candle:${symbol}:${exchange || 'all'}:${timeframe}`;
    const candles = this.candleCache.get(cacheKey);
    if (candles?.length) return candles[candles.length - 1];

    for (const [key, cachedCandles] of this.candleCache.entries()) {
      if (!cachedCandles.length) continue;
      if (!key.startsWith(`candle:${symbol}:`)) continue;
      if (!key.endsWith(`:${timeframe}`)) continue;
      if (exchange && !key.includes(`:${exchange}:`)) continue;
      return cachedCandles[cachedCandles.length - 1];
    }
    return null;
  }

  private isHistoryCacheFreshAndContiguous(
    candles: Candle[] | undefined,
    timeframe: Timeframe,
    limit: number,
  ): boolean {
    if (!candles || candles.length < limit) return false;

    const latest = candles.slice(-limit);
    const bucketMs = timeframeToMs(timeframe);
    const freshnessThresholdMs = bucketMs * 2;
    const latestTime = latest[latest.length - 1]?.time;

    if (!latestTime || Date.now() - latestTime > freshnessThresholdMs) {
      return false;
    }

    for (let index = 1; index < latest.length; index += 1) {
      if (latest[index].time - latest[index - 1].time !== bucketMs) {
        return false;
      }
    }

    return true;
  }

  async getCandles(symbol: string, timeframe: Timeframe, exchange?: ExchangeId, limit = 500, endTime?: number): Promise<Candle[]> {
    const cacheKey = `candle:${symbol}:${exchange || 'all'}:${timeframe}`;
    const cached = this.candleCache.get(cacheKey);
    const cachedHistory = endTime && cached
      ? cached.filter(c => c.time < endTime).slice(-limit)
      : [];
    // Only use cache for history requests if it has enough candles (≥ limit).
    // A small cache means only WS real-time candles have been stored so far —
    // returning those would cause charts to show only 1-2 candles instead of full history.
    if (!endTime && this.isHistoryCacheFreshAndContiguous(cached, timeframe, limit)) {
      return cached!.slice(-limit);
    }
    if (endTime && cachedHistory.length >= limit) return cachedHistory;
    try {
      let candles = await this.exchangeManager.fetchCandles(symbol, timeframe, exchange, limit, endTime);
      if (candles.length > 0) {
        // Merge with cached WS/history candles so deep scroll-back can reuse previously loaded ranges.
        const existing = this.candleCache.get(cacheKey) || [];
        const merged = [...candles];
        for (const ws of existing) {
          if (!merged.find(c => c.time === ws.time)) merged.push(ws);
        }
        merged.sort((a, b) => a.time - b.time);
        this.candleCache.set(cacheKey, merged.slice(-this.MAX_CANDLE_CACHE));
      }
      return candles;
    } catch (err) {
      if (endTime) return cachedHistory;
      return cached?.slice(-limit) || [];
    }
  }

  async getOrderBook(symbol: string, exchange?: ExchangeId, marketType: 'spot' | 'futures' = 'spot'): Promise<OrderBook | null> {
    if (exchange) {
      const key = `ob:${exchange}:${marketType}:${symbol}`;
      const cached = this.orderbookCache.get(key);
      if (cached) return cached;
    }
    const fetched = await this.exchangeManager.fetchOrderBook(symbol, exchange);
    if (!fetched) return null;
    if (!fetched.marketType) {
      fetched.marketType = marketType;
    }
    return fetched;
  }

  getLatestOrderBook(symbol: string, exchange?: ExchangeId, marketType: 'spot' | 'futures' = 'spot'): OrderBook | null {
    if (exchange) {
      return this.orderbookCache.get(`ob:${exchange}:${marketType}:${symbol}`) || null;
    }

    for (const [key, orderbook] of this.orderbookCache.entries()) {
      if (!key.endsWith(`:${symbol}`)) continue;
      if ((orderbook.marketType ?? 'spot') !== marketType) continue;
      return orderbook;
    }
    return null;
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
  }

  unsubscribeSymbol(symbol: string): void {
    const currentRefs = this.symbolSubscriptionRefs.get(symbol) || 0;
    if (currentRefs <= 1) {
      this.symbolSubscriptionRefs.delete(symbol);
      this.subscribedSymbols.delete(symbol);
      this.exchangeManager.unsubscribeTicker(symbol);
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

  subscribeOrderBook(symbol: string, marketType: 'spot' | 'futures' = 'spot', exchange?: ExchangeId): void {
    this.incrementScopedRefs(this.orderBookSubscriptionRefs, `${marketType}:${symbol}`, exchange, (id) => {
      this.exchangeManager.subscribeOrderBook(symbol, [id]);
    });
  }

  unsubscribeOrderBook(symbol: string, marketType: 'spot' | 'futures' = 'spot', exchange?: ExchangeId): void {
    this.decrementScopedRefs(this.orderBookSubscriptionRefs, `${marketType}:${symbol}`, exchange, (id) => {
      this.exchangeManager.unsubscribeOrderBook(symbol, [id]);
    });
  }

  private getScopedRefKey(symbol: string, exchange: ExchangeId): string {
    return `${symbol}|${exchange}`;
  }

  private incrementScopedRefs(
    refs: Map<string, number>,
    symbol: string,
    exchange?: ExchangeId,
    onFirstForExchange?: (exchangeId: ExchangeId) => void,
  ): void {
    const targets = exchange ? [exchange] : [...ALL_EXCHANGES];
    for (const id of targets) {
      const key = this.getScopedRefKey(symbol, id);
      const current = refs.get(key) || 0;
      refs.set(key, current + 1);
      if (current === 0) {
        onFirstForExchange?.(id);
        if (!onFirstForExchange) this.exchangeManager.subscribeTrades(symbol, [id]);
      }
    }
  }

  private decrementScopedRefs(
    refs: Map<string, number>,
    symbol: string,
    exchange?: ExchangeId,
    onLastForExchange?: (exchangeId: ExchangeId) => void,
  ): void {
    const targets = exchange ? [exchange] : [...ALL_EXCHANGES];
    for (const id of targets) {
      const key = this.getScopedRefKey(symbol, id);
      const current = refs.get(key) || 0;
      if (current <= 1) {
        refs.delete(key);
        if (onLastForExchange) onLastForExchange(id);
        else this.exchangeManager.unsubscribeTrades(symbol, [id]);
        continue;
      }
      refs.set(key, current - 1);
    }
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
