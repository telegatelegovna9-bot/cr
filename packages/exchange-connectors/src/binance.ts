// Binance exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, WS_RECONNECT_DELAY } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const BINANCE_SPOT_WS_URL = 'wss://stream.binance.com:9443/ws';
const BINANCE_FUTURES_PUBLIC_WS_URL = 'wss://fstream.binance.com/public/ws';
const BINANCE_FUTURES_MARKET_WS_URL = 'wss://fstream.binance.com/market/ws';
const BINANCE_SPOT_REST_URL = 'https://api.binance.com';
const BINANCE_FUTURES_REST_URL = 'https://fapi.binance.com';
const SUBSCRIPTION_BATCH_DELAY_MS = 250;
const LOCAL_BOOK_SNAPSHOT_LIMIT = 1000;
const EMITTED_BOOK_LEVEL_LIMIT = 120;

interface DepthEvent {
  marketType: 'spot' | 'futures';
  symbol: string;
  U: number;
  u: number;
  pu?: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface OrderBookSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface LocalOrderBookState {
  symbol: string;
  marketType: 'spot' | 'futures';
  bids: Map<number, number>;
  asks: Map<number, number>;
  lastUpdateId: number;
  previousStreamUpdateId: number | null;
  buffer: DepthEvent[];
  synced: boolean;
  syncing: boolean;
}

export class BinanceConnector extends BaseExchangeConnector {
  private futuresMarketWs: WebSocket | null = null;
  private futuresPublicWs: WebSocket | null = null;
  private futuresMarketConnected = false;
  private futuresPublicConnected = false;
  private activeSpotSubs = new Set<string>();
  private futuresMarketSubscriptions = new Set<string>();
  private futuresPublicSubscriptions = new Set<string>();
  private activeFuturesMarketSubs = new Set<string>();
  private activeFuturesPublicSubs = new Set<string>();
  private futuresMarketReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresPublicReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private spotPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private futuresMarketPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private futuresPublicPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private spotBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresMarketBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresPublicBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresMarketControlRetries = 0;
  private futuresPublicControlRetries = 0;
  private static readonly MAX_FUTURES_CONTROL_RETRIES = 10;
  private localOrderBooks = new Map<string, LocalOrderBookState>();

  constructor() {
    super({ id: 'binance', wsUrl: BINANCE_SPOT_WS_URL, restUrl: BINANCE_SPOT_REST_URL, rateLimit: 1200 });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return;

    const spotWs = new WebSocket(this.wsUrl);
    this.setupSpotWS(spotWs);

    const futuresMarketWs = new WebSocket(BINANCE_FUTURES_MARKET_WS_URL);
    this.setupFuturesMarketWS(futuresMarketWs);

    const futuresPublicWs = new WebSocket(BINANCE_FUTURES_PUBLIC_WS_URL);
    this.setupFuturesPublicWS(futuresPublicWs);

    await Promise.allSettled([
      new Promise<void>(res => { const t = setTimeout(res, 10000); spotWs.once('open', () => { clearTimeout(t); res(); }); }),
      new Promise<void>(res => { const t = setTimeout(res, 10000); futuresMarketWs.once('open', () => { clearTimeout(t); res(); }); }),
      new Promise<void>(res => { const t = setTimeout(res, 10000); futuresPublicWs.once('open', () => { clearTimeout(t); res(); }); }),
    ]);
  }

  private setupSpotWS(ws: WebSocket): void {
    this.setupWebSocket(ws);
    ws.on('open', () => {
      for (const stream of this.activeSpotSubs) this.enqueueSpotControl('SUBSCRIBE', stream);
    });
  }

  private setupFuturesMarketWS(ws: WebSocket): void {
    this.futuresMarketWs = ws;
    ws.on('open', () => {
      this.futuresMarketConnected = true;
      this.emit('connected');
      for (const stream of this.activeFuturesMarketSubs) this.enqueueFuturesMarketControl('SUBSCRIBE', stream);
    });
    ws.on('message', (data: Buffer) => this.handleFuturesMessage(data, 'market'));
    ws.on('close', () => {
      this.futuresMarketConnected = false;
      this.futuresMarketWs = null;
      this.clearFuturesMarketControlBatch();
      if (!this.futuresMarketReconnectTimer) {
        this.futuresMarketReconnectTimer = setTimeout(() => {
          this.futuresMarketReconnectTimer = null;
          this.reconnectFuturesMarketWS();
        }, WS_RECONNECT_DELAY);
      }
    });
    ws.on('error', (err: Error) => {
      console.warn(`[binance] Futures market WS error: ${err.message}`);
      ws.close();
    });
  }

  private setupFuturesPublicWS(ws: WebSocket): void {
    this.futuresPublicWs = ws;
    ws.on('open', () => {
      this.futuresPublicConnected = true;
      this.emit('connected');
      for (const stream of this.activeFuturesPublicSubs) this.enqueueFuturesPublicControl('SUBSCRIBE', stream);
    });
    ws.on('message', (data: Buffer) => this.handleFuturesMessage(data, 'public'));
    ws.on('close', () => {
      this.futuresPublicConnected = false;
      this.futuresPublicWs = null;
      this.clearFuturesPublicControlBatch();
      if (!this.futuresPublicReconnectTimer) {
        this.futuresPublicReconnectTimer = setTimeout(() => {
          this.futuresPublicReconnectTimer = null;
          this.reconnectFuturesPublicWS();
        }, WS_RECONNECT_DELAY);
      }
    });
    ws.on('error', (err: Error) => {
      console.warn(`[binance] Futures public WS error: ${err.message}`);
      ws.close();
    });
  }

  private handleFuturesMessage(data: Buffer, route: 'market' | 'public'): void {
    try {
      const raw = JSON.parse(data.toString()) as Record<string, unknown>;
      const msg = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
      msg.__marketType = 'futures';
      msg.__route = route;
      if (!msg.__stream && typeof raw.stream === 'string') msg.__stream = raw.stream;
      this.handleMessage(msg);
    } catch {
      // ignore malformed payloads
    }
  }

  private reconnectFuturesMarketWS(): void {
    if (this.futuresMarketWs) return;
    this.setupFuturesMarketWS(new WebSocket(BINANCE_FUTURES_MARKET_WS_URL));
  }

  private reconnectFuturesPublicWS(): void {
    if (this.futuresPublicWs) return;
    this.setupFuturesPublicWS(new WebSocket(BINANCE_FUTURES_PUBLIC_WS_URL));
  }

  private isFuturesSymbol(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    return upper.includes(':USDT') || upper.includes(':USD');
  }

  private toBinanceSymbol(symbol: string): string {
    const isFutures = this.isFuturesSymbol(symbol);
    const base = symbol.includes('/') ? symbol.split('/')[0] : symbol.split(':')[0];
    return isFutures ? `${base}USDT` : this.toLocalSymbol(symbol);
  }

  private toFuturesSymbol(raw: string): string {
    const base = raw.toUpperCase().replace(/USDT$/, '');
    return `${base}/USDT:USDT`;
  }

  subscribeTicker(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      if (this.futuresMarketSubscriptions.has(`ticker:${symbol}`)) return;
      this.futuresMarketSubscriptions.add(`ticker:${symbol}`);
      this.activeFuturesMarketSubs.add(`${local}@ticker`);
      this.enqueueFuturesMarketControl('SUBSCRIBE', `${local}@ticker`);
      return;
    }

    if (this.subscriptions.has(`ticker:${symbol}`)) return;
    this.subscriptions.add(`ticker:${symbol}`);
    this.activeSpotSubs.add(`${local}@ticker`);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@ticker`);
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    const interval = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      if (this.futuresMarketSubscriptions.has(`candle:${symbol}:${timeframe}`)) return;
      this.futuresMarketSubscriptions.add(`candle:${symbol}:${timeframe}`);
      this.activeFuturesMarketSubs.add(`${local}@kline_${interval}`);
      this.enqueueFuturesMarketControl('SUBSCRIBE', `${local}@kline_${interval}`);
      return;
    }

    if (this.subscriptions.has(`candle:${symbol}:${timeframe}`)) return;
    this.subscriptions.add(`candle:${symbol}:${timeframe}`);
    this.activeSpotSubs.add(`${local}@kline_${interval}`);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@kline_${interval}`);
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      if (this.futuresPublicSubscriptions.has(`orderbook:${symbol}`)) return;
      this.futuresPublicSubscriptions.add(`orderbook:${symbol}`);
      this.activeFuturesPublicSubs.add(`${local}@depth@100ms`);
      this.enqueueFuturesPublicControl('SUBSCRIBE', `${local}@depth@100ms`);
      void this.initializeLocalOrderBook(symbol, 'futures');
      return;
    }

    if (this.subscriptions.has(`orderbook:${symbol}`)) return;
    this.subscriptions.add(`orderbook:${symbol}`);
    this.activeSpotSubs.add(`${local}@depth@100ms`);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@depth@100ms`);
    void this.initializeLocalOrderBook(symbol, 'spot');
  }

  subscribeTrades(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      if (this.futuresMarketSubscriptions.has(`trades:${symbol}`)) return;
      this.futuresMarketSubscriptions.add(`trades:${symbol}`);
      this.activeFuturesMarketSubs.add(`${local}@aggTrade`);
      this.enqueueFuturesMarketControl('SUBSCRIBE', `${local}@aggTrade`);
      return;
    }

    if (this.subscriptions.has(`trades:${symbol}`)) return;
    this.subscriptions.add(`trades:${symbol}`);
    this.activeSpotSubs.add(`${local}@aggTrade`);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@aggTrade`);
  }

  unsubscribeTicker(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      this.futuresMarketSubscriptions.delete(`ticker:${symbol}`);
      this.activeFuturesMarketSubs.delete(`${local}@ticker`);
      this.enqueueFuturesMarketControl('UNSUBSCRIBE', `${local}@ticker`);
      return;
    }

    this.subscriptions.delete(`ticker:${symbol}`);
    this.activeSpotSubs.delete(`${local}@ticker`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@ticker`);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    const interval = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      this.futuresMarketSubscriptions.delete(`candle:${symbol}:${timeframe}`);
      this.activeFuturesMarketSubs.delete(`${local}@kline_${interval}`);
      this.enqueueFuturesMarketControl('UNSUBSCRIBE', `${local}@kline_${interval}`);
      return;
    }

    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.activeSpotSubs.delete(`${local}@kline_${interval}`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@kline_${interval}`);
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      this.futuresPublicSubscriptions.delete(`orderbook:${symbol}`);
      this.activeFuturesPublicSubs.delete(`${local}@depth@100ms`);
      this.enqueueFuturesPublicControl('UNSUBSCRIBE', `${local}@depth@100ms`);
      this.localOrderBooks.delete(this.getLocalOrderBookKey(symbol, 'futures'));
      return;
    }

    this.subscriptions.delete(`orderbook:${symbol}`);
    this.activeSpotSubs.delete(`${local}@depth@100ms`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@depth@100ms`);
    this.localOrderBooks.delete(this.getLocalOrderBookKey(symbol, 'spot'));
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toBinanceSymbol(symbol).toLowerCase();
    if (this.isFuturesSymbol(symbol)) {
      this.futuresMarketSubscriptions.delete(`trades:${symbol}`);
      this.activeFuturesMarketSubs.delete(`${local}@aggTrade`);
      this.enqueueFuturesMarketControl('UNSUBSCRIBE', `${local}@aggTrade`);
      return;
    }

    this.subscriptions.delete(`trades:${symbol}`);
    this.activeSpotSubs.delete(`${local}@aggTrade`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@aggTrade`);
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    if (msg.result !== undefined || msg.id !== undefined || msg.error) return;
    if (!msg.e && !msg.data && !msg.stream) return;

    const data = (msg.data as Record<string, unknown>) || msg;
    const eventType = (data.e as string) || (msg.e as string);
    if (!data.__marketType) data.__marketType = msg.__marketType;
    if (!data.__stream && msg.__stream) data.__stream = msg.__stream;

    switch (eventType) {
      case '24hrTicker':
        this.handleTicker(data);
        break;
      case 'kline':
        this.handleKline(data);
        break;
      case 'depthUpdate':
        this.handleDepthUpdate(data);
        break;
      case 'trade':
      case 'aggTrade':
        this.handleTrade(data);
        break;
      default:
        break;
    }
  }

  private handleTicker(data: Record<string, unknown>): void {
    const isFutures = data.__marketType === 'futures';
    this.emit('ticker', {
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      symbol: isFutures ? this.toFuturesSymbol(data.s as string) : this.fromLocalSymbol(data.s as string),
      lastPrice: parseFloat(data.c as string),
      priceChange24h: parseFloat(data.p as string),
      volume24h: parseFloat(data.v as string),
      high24h: parseFloat(data.h as string),
      low24h: parseFloat(data.l as string),
      timestamp: Date.now(),
      priceChangePercent24h: parseFloat(data.P as string),
      quoteVolume24h: parseFloat(data.q as string),
      trades24h: parseInt(data.n as string, 10),
      bid: parseFloat(data.b as string),
      ask: parseFloat(data.a as string),
      spread: parseFloat(data.a as string) - parseFloat(data.b as string),
    } as Ticker);
  }

  private handleKline(data: Record<string, unknown>): void {
    const kline = data.k as Record<string, unknown>;
    if (!kline) return;
    const isFutures = data.__marketType === 'futures';
    this.emit('candle', {
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      symbol: isFutures ? this.toFuturesSymbol(kline.s as string) : this.fromLocalSymbol(kline.s as string),
      timeframe: kline.i as string,
      time: kline.t as number,
      open: parseFloat(kline.o as string),
      high: parseFloat(kline.h as string),
      low: parseFloat(kline.l as string),
      close: parseFloat(kline.c as string),
      volume: parseFloat(kline.v as string),
      isClosed: kline.x as boolean,
      trades: parseInt(kline.n as string, 10),
    } as Candle);
  }

  private handleDepthUpdate(data: Record<string, unknown>): void {
    const marketType = data.__marketType === 'futures' ? 'futures' : 'spot';
    let rawSymbol = (data.s as string) || '';
    if (!rawSymbol && data.__stream) rawSymbol = (data.__stream as string).split('@')[0].toUpperCase();
    if (!rawSymbol) return;

    const symbol = marketType === 'futures' ? this.toFuturesSymbol(rawSymbol) : this.fromLocalSymbol(rawSymbol);
    const event: DepthEvent = {
      marketType,
      symbol,
      U: Number(data.U),
      u: Number(data.u),
      pu: data.pu === undefined ? undefined : Number(data.pu),
      bids: ((data.b as [string, string][]) || []).map(([price, quantity]) => [price, quantity]),
      asks: ((data.a as [string, string][]) || []).map(([price, quantity]) => [price, quantity]),
    };

    this.queueDepthEvent(event);
  }

  private handleTrade(data: Record<string, unknown>): void {
    const isFutures = data.__marketType === 'futures';
    this.emit('trade', {
      id: String(data.t || data.a),
      symbol: isFutures ? this.toFuturesSymbol(data.s as string) : this.fromLocalSymbol(data.s as string),
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      price: parseFloat(data.p as string),
      quantity: parseFloat(data.q as string),
      side: data.m ? 'sell' : 'buy',
      timestamp: Number(data.T || data.E),
    } as Trade);
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchArray<any>(`${this.restUrl}/api/v3/ticker/24hr`, 'spot tickers'),
      this.fetchArray<any>(`${BINANCE_FUTURES_REST_URL}/fapi/v1/ticker/24hr`, 'futures tickers'),
    ]);
    const results: Ticker[] = [];
    if (spotRes.status === 'fulfilled') {
      results.push(...spotRes.value.filter(t => t.symbol.endsWith('USDT')).map((t: any): Ticker => ({
        exchange: 'binance', marketType: 'spot', symbol: normalizeSymbol(t.symbol, 'binance'),
        lastPrice: parseFloat(t.lastPrice), priceChange24h: parseFloat(t.priceChange), volume24h: parseFloat(t.volume),
        high24h: parseFloat(t.highPrice), low24h: parseFloat(t.lowPrice), timestamp: Date.now(),
        priceChangePercent24h: parseFloat(t.priceChangePercent), quoteVolume24h: parseFloat(t.quoteVolume),
        trades24h: parseInt(t.count, 10), bid: parseFloat(t.bidPrice), ask: parseFloat(t.askPrice), spread: parseFloat(t.askPrice) - parseFloat(t.bidPrice),
      })));
    }
    if (futuresRes.status === 'fulfilled') {
      results.push(...futuresRes.value.filter(t => t.symbol.endsWith('USDT')).map((t: any): Ticker => {
        const lastPrice = parseFloat(t.lastPrice);
        return {
          exchange: 'binance', marketType: 'futures', symbol: this.toFuturesSymbol(t.symbol),
          lastPrice, priceChange24h: parseFloat(t.priceChange), volume24h: parseFloat(t.volume),
          high24h: parseFloat(t.highPrice), low24h: parseFloat(t.lowPrice), timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.priceChangePercent), quoteVolume24h: parseFloat(t.quoteVolume),
          trades24h: parseInt(t.count, 10), bid: lastPrice, ask: lastPrice, spread: 0,
        };
      }));
    }
    return symbols ? results.filter(t => symbols.includes(t.symbol)) : results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    const interval = TIMEFRAME_MAP[timeframe];
    let url = `${isFutures ? BINANCE_FUTURES_REST_URL : this.restUrl}${isFutures ? '/fapi/v1/klines' : '/api/v3/klines'}?symbol=${this.toBinanceSymbol(symbol)}&interval=${interval}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchArray<any[]>(url, `${symbol} candles`);
    return data.map(k => ({
      exchange: 'binance', marketType: isFutures ? 'futures' : 'spot', symbol, timeframe, time: k[0],
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5]), isClosed: true, trades: parseInt(k[8], 10),
    }));
  }

  async fetchOrderBook(
    symbol: string,
    marketType?: 'spot' | 'futures',
    limit = 50,
  ): Promise<OrderBook> {
    const resolvedMarketType = marketType ?? (this.isFuturesSymbol(symbol) ? 'futures' : 'spot');
    const snapshot = await this.fetchOrderBookSnapshot(symbol, limit, resolvedMarketType);
    return this.snapshotToOrderBook(symbol, resolvedMarketType, snapshot);
  }

  private async fetchOrderBookSnapshot(
    symbol: string,
    limit = LOCAL_BOOK_SNAPSHOT_LIMIT,
    marketType?: 'spot' | 'futures',
  ): Promise<OrderBookSnapshot> {
    const isFutures = marketType ? marketType === 'futures' : this.isFuturesSymbol(symbol);
    const local = this.toBinanceSymbol(symbol);
    const url = isFutures
      ? `${BINANCE_FUTURES_REST_URL}/fapi/v1/depth?symbol=${local}&limit=${limit}`
      : `${BINANCE_SPOT_REST_URL}/api/v3/depth?symbol=${local}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`[binance] HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json() as { lastUpdateId: number; bids: [string, string][]; asks: [string, string][] };
    return {
      lastUpdateId: Number(data.lastUpdateId),
      bids: data.bids ?? [],
      asks: data.asks ?? [],
    };
  }

  private snapshotToOrderBook(symbol: string, marketType: 'spot' | 'futures', snapshot: OrderBookSnapshot): OrderBook {
    return {
      symbol,
      exchange: 'binance',
      marketType,
      bids: snapshot.bids.map(([price, quantity]) => ({ price: parseFloat(price), quantity: parseFloat(quantity) })),
      asks: snapshot.asks.map(([price, quantity]) => ({ price: parseFloat(price), quantity: parseFloat(quantity) })),
      timestamp: Date.now(),
    };
  }

  private getLocalOrderBookKey(symbol: string, marketType: 'spot' | 'futures'): string {
    return `${marketType}:${symbol}`;
  }

  private getOrCreateLocalOrderBook(symbol: string, marketType: 'spot' | 'futures'): LocalOrderBookState {
    const key = this.getLocalOrderBookKey(symbol, marketType);
    const existing = this.localOrderBooks.get(key);
    if (existing) return existing;

    const created: LocalOrderBookState = {
      symbol,
      marketType,
      bids: new Map(),
      asks: new Map(),
      lastUpdateId: 0,
      previousStreamUpdateId: null,
      buffer: [],
      synced: false,
      syncing: false,
    };
    this.localOrderBooks.set(key, created);
    return created;
  }

  private async initializeLocalOrderBook(symbol: string, marketType: 'spot' | 'futures'): Promise<void> {
    const state = this.getOrCreateLocalOrderBook(symbol, marketType);
    if (state.syncing) return;

    state.syncing = true;
    state.synced = false;
    state.previousStreamUpdateId = null;

    try {
      const snapshot = await this.fetchOrderBookSnapshot(symbol);
      state.bids = this.toLevelMap(snapshot.bids);
      state.asks = this.toLevelMap(snapshot.asks);
      state.lastUpdateId = snapshot.lastUpdateId;
      state.synced = true;

      const buffered = state.buffer;
      state.buffer = [];
      for (const event of buffered) {
        if (!this.applyDepthEvent(state, event, true)) {
          return;
        }
      }

      this.emitLocalOrderBook(state);
    } catch {
      state.synced = false;
    } finally {
      state.syncing = false;
    }
  }

  private queueDepthEvent(event: DepthEvent): void {
    const state = this.getOrCreateLocalOrderBook(event.symbol, event.marketType);
    state.buffer.push(event);
    if (state.buffer.length > 200) {
      state.buffer.splice(0, state.buffer.length - 200);
    }

    if (!state.synced) {
      if (!state.syncing) {
        void this.initializeLocalOrderBook(event.symbol, event.marketType);
      }
      return;
    }

    state.buffer.length = 0;
    this.applyDepthEvent(state, event, false);
  }

  private applyDepthEvent(state: LocalOrderBookState, event: DepthEvent, allowBootstrap: boolean): boolean {
    if (event.u < state.lastUpdateId) {
      return true;
    }

    const isFutures = state.marketType === 'futures';
    const requiresBootstrapMatch = state.previousStreamUpdateId === null;

    if (requiresBootstrapMatch) {
      const bootstrapReady = isFutures
        ? event.U <= state.lastUpdateId && event.u >= state.lastUpdateId
        : event.U <= state.lastUpdateId + 1 && event.u >= state.lastUpdateId + 1;

      if (!bootstrapReady) {
        if (allowBootstrap) return true;
        void this.initializeLocalOrderBook(state.symbol, state.marketType);
        return false;
      }
    } else if (isFutures && event.pu !== undefined && event.pu !== state.previousStreamUpdateId) {
      void this.initializeLocalOrderBook(state.symbol, state.marketType);
      return false;
    } else if (event.U > state.lastUpdateId + 1) {
      void this.initializeLocalOrderBook(state.symbol, state.marketType);
      return false;
    }

    this.applyLevels(state.bids, event.bids);
    this.applyLevels(state.asks, event.asks);
    state.lastUpdateId = event.u;
    state.previousStreamUpdateId = event.u;
    this.emitLocalOrderBook(state);
    return true;
  }

  private applyLevels(target: Map<number, number>, updates: [string, string][]): void {
    for (const [priceRaw, quantityRaw] of updates) {
      const price = parseFloat(priceRaw);
      const quantity = parseFloat(quantityRaw);
      if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
      if (quantity === 0) target.delete(price);
      else target.set(price, quantity);
    }
  }

  private toLevelMap(levels: [string, string][]): Map<number, number> {
    const map = new Map<number, number>();
    for (const [priceRaw, quantityRaw] of levels) {
      const price = parseFloat(priceRaw);
      const quantity = parseFloat(quantityRaw);
      if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) continue;
      map.set(price, quantity);
    }
    return map;
  }

  private emitLocalOrderBook(state: LocalOrderBookState): void {
    const bids = [...state.bids.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, EMITTED_BOOK_LEVEL_LIMIT)
      .map(([price, quantity]) => ({ price, quantity }));
    const asks = [...state.asks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, EMITTED_BOOK_LEVEL_LIMIT)
      .map(([price, quantity]) => ({ price, quantity }));

    if (!bids.length && !asks.length) return;

    this.emit('orderbook', {
      symbol: state.symbol,
      exchange: 'binance',
      marketType: state.marketType,
      bids,
      asks,
      timestamp: Date.now(),
    } as OrderBook);
  }

  private sendFuturesMarket(data: unknown): void {
    if (this.futuresMarketWs && this.futuresMarketWs.readyState === 1) {
      this.futuresMarketWs.send(JSON.stringify(data));
    }
  }

  private sendFuturesPublic(data: unknown): void {
    if (this.futuresPublicWs && this.futuresPublicWs.readyState === 1) {
      this.futuresPublicWs.send(JSON.stringify(data));
    }
  }

  protected getPingMessage(): null { return null; }

  disconnect(): void {
    super.disconnect();
    this.clearControlBatchTimers();
    this.localOrderBooks.clear();

    if (this.futuresMarketWs) {
      this.futuresMarketWs.removeAllListeners();
      this.futuresMarketWs.close();
      this.futuresMarketWs = null;
    }
    if (this.futuresPublicWs) {
      this.futuresPublicWs.removeAllListeners();
      this.futuresPublicWs.close();
      this.futuresPublicWs = null;
    }

    this.futuresMarketConnected = false;
    this.futuresPublicConnected = false;
    this.activeSpotSubs.clear();
    this.futuresMarketSubscriptions.clear();
    this.futuresPublicSubscriptions.clear();
    this.activeFuturesMarketSubs.clear();
    this.activeFuturesPublicSubs.clear();
  }

  private enqueueSpotControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.spotPendingStreams.set(stream, method);
    if (!this.spotBatchTimer) {
      this.spotBatchTimer = setTimeout(() => {
        this.spotBatchTimer = null;
        this.flushSpotControl();
      }, SUBSCRIPTION_BATCH_DELAY_MS);
    }
  }

  private flushSpotControl(): void {
    if (!this.ws || !this.connected || this.spotPendingStreams.size === 0) return;
    for (const [method, params] of this.groupPendingStreams(this.spotPendingStreams)) {
      this.send({ method, params, id: Date.now() });
    }
    this.spotPendingStreams.clear();
  }

  private enqueueFuturesMarketControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.futuresMarketPendingStreams.set(stream, method);
    if (!this.futuresMarketBatchTimer) {
      this.futuresMarketBatchTimer = setTimeout(() => {
        this.futuresMarketBatchTimer = null;
        this.flushFuturesMarketControl();
      }, SUBSCRIPTION_BATCH_DELAY_MS);
    }
  }

  private flushFuturesMarketControl(): void {
    if (!this.futuresMarketWs || this.futuresMarketWs.readyState !== 1 || this.futuresMarketPendingStreams.size === 0) {
      if (this.futuresMarketPendingStreams.size > 0 && (!this.futuresMarketWs || this.futuresMarketWs.readyState !== 1)) {
        this.futuresMarketControlRetries++;
        if (this.futuresMarketControlRetries >= BinanceConnector.MAX_FUTURES_CONTROL_RETRIES) {
          console.warn(`[binance] Max futures market control retries reached (${this.futuresMarketControlRetries}), discarding ${this.futuresMarketPendingStreams.size} pending`);
          this.futuresMarketPendingStreams.clear();
          this.futuresMarketControlRetries = 0;
          return;
        }
        if (!this.futuresMarketBatchTimer) {
          this.futuresMarketBatchTimer = setTimeout(() => {
            this.futuresMarketBatchTimer = null;
            this.flushFuturesMarketControl();
          }, 1000);
        }
      }
      return;
    }

    for (const [method, params] of this.groupPendingStreams(this.futuresMarketPendingStreams)) {
      this.sendFuturesMarket({ method, params, id: Date.now() });
    }
    this.futuresMarketPendingStreams.clear();
    this.futuresMarketControlRetries = 0;
  }

  private enqueueFuturesPublicControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.futuresPublicPendingStreams.set(stream, method);
    if (!this.futuresPublicBatchTimer) {
      this.futuresPublicBatchTimer = setTimeout(() => {
        this.futuresPublicBatchTimer = null;
        this.flushFuturesPublicControl();
      }, SUBSCRIPTION_BATCH_DELAY_MS);
    }
  }

  private flushFuturesPublicControl(): void {
    if (!this.futuresPublicWs || this.futuresPublicWs.readyState !== 1 || this.futuresPublicPendingStreams.size === 0) {
      if (this.futuresPublicPendingStreams.size > 0 && (!this.futuresPublicWs || this.futuresPublicWs.readyState !== 1)) {
        this.futuresPublicControlRetries++;
        if (this.futuresPublicControlRetries >= BinanceConnector.MAX_FUTURES_CONTROL_RETRIES) {
          console.warn(`[binance] Max futures public control retries reached (${this.futuresPublicControlRetries}), discarding ${this.futuresPublicPendingStreams.size} pending`);
          this.futuresPublicPendingStreams.clear();
          this.futuresPublicControlRetries = 0;
          return;
        }
        if (!this.futuresPublicBatchTimer) {
          this.futuresPublicBatchTimer = setTimeout(() => {
            this.futuresPublicBatchTimer = null;
            this.flushFuturesPublicControl();
          }, 1000);
        }
      }
      return;
    }

    for (const [method, params] of this.groupPendingStreams(this.futuresPublicPendingStreams)) {
      this.sendFuturesPublic({ method, params, id: Date.now() });
    }
    this.futuresPublicPendingStreams.clear();
    this.futuresPublicControlRetries = 0;
  }

  private groupPendingStreams(streams: Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>): Array<['SUBSCRIBE' | 'UNSUBSCRIBE', string[]]> {
    const groups = new Map<'SUBSCRIBE' | 'UNSUBSCRIBE', string[]>();
    for (const [stream, method] of streams) {
      const params = groups.get(method) || [];
      params.push(stream);
      groups.set(method, params);
    }
    return Array.from(groups.entries());
  }

  private clearControlBatchTimers(): void {
    if (this.spotBatchTimer) {
      clearTimeout(this.spotBatchTimer);
      this.spotBatchTimer = null;
    }
    if (this.futuresMarketBatchTimer) {
      clearTimeout(this.futuresMarketBatchTimer);
      this.futuresMarketBatchTimer = null;
    }
    if (this.futuresPublicBatchTimer) {
      clearTimeout(this.futuresPublicBatchTimer);
      this.futuresPublicBatchTimer = null;
    }
  }

  private clearFuturesMarketControlBatch(): void {
    if (this.futuresMarketBatchTimer) {
      clearTimeout(this.futuresMarketBatchTimer);
      this.futuresMarketBatchTimer = null;
    }
    this.futuresMarketPendingStreams.clear();
    this.futuresMarketControlRetries = 0;
  }

  private clearFuturesPublicControlBatch(): void {
    if (this.futuresPublicBatchTimer) {
      clearTimeout(this.futuresPublicBatchTimer);
      this.futuresPublicBatchTimer = null;
    }
    this.futuresPublicPendingStreams.clear();
    this.futuresPublicControlRetries = 0;
  }

  private async fetchArray<T>(url: string, _label: string): Promise<T[]> {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`[binance] HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : data.data || [];
  }

  isConnected(): boolean {
    return this.connected || this.futuresMarketConnected || this.futuresPublicConnected;
  }
}
