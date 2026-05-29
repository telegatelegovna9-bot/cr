// Binance exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, generateId } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const BINANCE_SPOT_WS_URL = 'wss://data-stream.binance.vision:443/ws';
const BINANCE_SPOT_REST_URL = 'https://data-api.binance.vision';
const BINANCE_FUTURES_WS_URL = 'wss://fstream.binance.com/ws';
const BINANCE_FUTURES_REST_URL = 'https://fapi.binance.com';
const SUBSCRIPTION_BATCH_DELAY_MS = 250;

export class BinanceConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();
  private spotPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private futuresPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private spotBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({
      id: 'binance',
      wsUrl: BINANCE_SPOT_WS_URL,
      restUrl: BINANCE_SPOT_REST_URL,
      rateLimit: 1200,
    });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return; // prevent duplicate while connecting/connected

    // ── Spot WebSocket ─────────────────────────────────────────────────────
    const ws = new WebSocket(this.wsUrl);
    this.setupWebSocket(ws); // registers open/close/message/error lifecycle handlers
    ws.on('close', (code: number, reason: Buffer) => {
      this.clearSpotControlBatch();
      console.warn(`[binance] Spot WS closed code=${code} reason=${reason.toString() || 'n/a'}`);
    });
    ws.on('error', (err: Error) => {
      console.warn(`[binance] Spot WS error: ${err.message}`);
    });

    ws.on('unexpected-response', (_req: unknown, res: { statusCode: number }) => {
      if (res.statusCode === 451) {
        this.blockReconnect();
        console.error('[binance] Spot WS geo-blocked (HTTP 451) — reconnect disabled');
      } else {
        console.warn(`[binance] Spot WS HTTP ${res.statusCode} — will retry`);
      }
    });

    // ── Futures WebSocket ──────────────────────────────────────────────────
    const futuresWs = new WebSocket(BINANCE_FUTURES_WS_URL);
    this.futuresWs = futuresWs;

    futuresWs.on('open', () => {
      this.futuresConnected = true;
    });
    futuresWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        msg.__marketType = 'futures';
        this.handleMessage(msg);
      } catch { /* ignore non-JSON */ }
    });
    futuresWs.on('close', () => {
      this.futuresConnected = false;
      this.futuresSubscriptions.clear();
      this.clearFuturesControlBatch();
    });
    futuresWs.on('error', (err: Error) => {
      console.warn(`[binance] Futures WS error: ${err.message}`);
    });
    futuresWs.on('unexpected-response', (_req: unknown, res: { statusCode: number }) => {
      if (res.statusCode === 451) this.blockReconnect();
    });

    // Wait for spot to open (or fail) — always resolves, never hangs.
    // Actual connected/disconnected state is driven by setupWebSocket events.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000); // 10 s timeout — never block connectAll()
      const done = () => { clearTimeout(timer); resolve(); };
      ws.once('open', done);
      ws.once('error', done);
      ws.once('close', done);
    });
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBinanceSymbol(symbol).toLowerCase();
      const key = `ticker:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@ticker`);
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@ticker`);
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBinanceSymbol(symbol).toLowerCase();
      const tf = TIMEFRAME_MAP[timeframe];
      const key = `candle:${symbol}:${timeframe}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@kline_${tf}`);
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    const tf = TIMEFRAME_MAP[timeframe];
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@kline_${tf}`);
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@depth20@100ms`);
  }

  subscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.enqueueSpotControl('SUBSCRIBE', `${local}@trade`);
  }

  unsubscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBinanceSymbol(symbol).toLowerCase();
      this.futuresSubscriptions.delete(`ticker:${symbol}`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@ticker`);
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`ticker:${symbol}`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@ticker`);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBinanceSymbol(symbol).toLowerCase();
      const tf = TIMEFRAME_MAP[timeframe];
      this.futuresSubscriptions.delete(`candle:${symbol}:${timeframe}`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@kline_${tf}`);
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    const tf = TIMEFRAME_MAP[timeframe];
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@kline_${tf}`);
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@depth20@100ms`);
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`trades:${symbol}`);
    this.enqueueSpotControl('UNSUBSCRIBE', `${local}@trade`);
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    if (!msg.e && !msg.data) return;

    const data = msg.data as Record<string, unknown> | undefined;
    const eventType = (data?.e as string) || (msg.e as string);

    switch (eventType) {
      case '24hrTicker':
        this.handleTicker(data || msg);
        break;
      case 'kline':
        this.handleKline(data || msg);
        break;
      case 'depthUpdate':
        this.handleDepthUpdate(data || msg);
        break;
      case 'trade':
        this.handleTrade(data || msg);
        break;
    }
  }

  private handleTicker(data: Record<string, unknown>): void {
    const isFutures = data.__marketType === 'futures';
    const symbol = isFutures ? this.toFuturesSymbol(data.s as string) : this.fromLocalSymbol(data.s as string);
    const ticker: Ticker = {
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      symbol,
      lastPrice: parseFloat(data.c as string),
      priceChange24h: parseFloat(data.p as string),
      volume24h: parseFloat(data.v as string),
      high24h: parseFloat(data.h as string),
      low24h: parseFloat(data.l as string),
      timestamp: Date.now(),
      // Optional fields
      priceChangePercent24h: parseFloat(data.P as string),
      quoteVolume24h: parseFloat(data.q as string),
      trades24h: parseInt(data.n as string, 10),
      bid: parseFloat(data.b as string),
      ask: parseFloat(data.a as string),
      spread: parseFloat(data.a as string) - parseFloat(data.b as string),
    };
    this.emit('ticker', ticker);
  }

  private handleKline(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown>;
    if (!k) return;
    const timeframe = k.i as string;
    const isFutures = data.__marketType === 'futures';
    const symbol = isFutures ? this.toFuturesSymbol(k.s as string) : this.fromLocalSymbol(k.s as string);
    const candle: Candle = {
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      symbol,
      timeframe,
      time: k.t as number,
      open: parseFloat(k.o as string),
      high: parseFloat(k.h as string),
      low: parseFloat(k.l as string),
      close: parseFloat(k.c as string),
      volume: parseFloat(k.v as string),
      isClosed: k.x as boolean,
      trades: parseInt(k.n as string, 10),
    };
    this.emit('candle', candle);
  }

  private handleDepthUpdate(data: Record<string, unknown>): void {
    const bidsRaw = (data.bids || data.b) as [string, string][] | undefined;
    const bids = bidsRaw?.map(([p, q]: [string, string]) => ({
      price: parseFloat(p),
      quantity: parseFloat(q),
    })) || [];
    const asksRaw = (data.asks || data.a) as [string, string][] | undefined;
    const asks = asksRaw?.map(([p, q]: [string, string]) => ({
      price: parseFloat(p),
      quantity: parseFloat(q),
    })) || [];

    this.emit('orderbook', {
      symbol: 'unknown', // Binance doesn't include symbol in depth updates
      exchange: 'binance',
      bids,
      asks,
      timestamp: Date.now(),
    } as OrderBook);
  }

  private handleTrade(data: Record<string, unknown>): void {
    const symbol = this.fromLocalSymbol(data.s as string);
    const trade: Trade = {
      id: String(data.t),
      symbol,
      exchange: 'binance',
      price: parseFloat(data.p as string),
      quantity: parseFloat(data.q as string),
      side: (data.m as boolean) ? 'sell' : 'buy',
      timestamp: data.T as number,
    };
    this.emit('trade', trade);
  }

  // REST API methods
  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchArray<Record<string, unknown>>(`${this.restUrl}/api/v3/ticker/24hr`, 'spot tickers'),
      this.fetchArray<Record<string, unknown>>(`${BINANCE_FUTURES_REST_URL}/fapi/v1/ticker/24hr`, 'futures tickers'),
    ]);

    const results: Ticker[] = [];

    if (spotRes.status === 'fulfilled') {
      const spot = spotRes.value
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          exchange: 'binance',
          marketType: 'spot',
          symbol: normalizeSymbol(t.symbol as string, 'binance'),
          lastPrice: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.priceChange as string),
          volume24h: parseFloat(t.volume as string),
          high24h: parseFloat(t.highPrice as string),
          low24h: parseFloat(t.lowPrice as string),
          timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.priceChangePercent as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: parseInt(t.count as string, 10),
          bid: parseFloat(t.bidPrice as string),
          ask: parseFloat(t.askPrice as string),
          spread: parseFloat(t.askPrice as string) - parseFloat(t.bidPrice as string),
        }));
      results.push(...spot);
    }

    if (futuresRes.status === 'fulfilled') {
      const futures = futuresRes.value
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => {
          const raw = t.symbol as string;
          const base = raw.slice(0, -4);
          const symbol = `${base}/USDT:USDT`;
          const lastPrice = parseFloat(t.lastPrice as string);
          return {
            exchange: 'binance',
            marketType: 'futures',
            symbol,
            lastPrice,
            priceChange24h: parseFloat(t.priceChange as string),
            volume24h: parseFloat(t.volume as string),
            high24h: parseFloat(t.highPrice as string),
            low24h: parseFloat(t.lowPrice as string),
            timestamp: Date.now(),
            priceChangePercent24h: parseFloat(t.priceChangePercent as string),
            quoteVolume24h: parseFloat(t.quoteVolume as string),
            trades24h: parseInt(t.count as string, 10),
            bid: lastPrice,
            ask: lastPrice,
            spread: 0,
          };
        });
      results.push(...futures);
    }

    if (symbols) return results.filter(t => symbols.includes(t.symbol));
    return results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    const local = this.toBinanceSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const baseUrl = isFutures ? BINANCE_FUTURES_REST_URL : this.restUrl;
    const path = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';
    let url = `${baseUrl}${path}?symbol=${local}&interval=${tf}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;

    const data = await this.fetchArray<unknown[]>(url, `${symbol} ${timeframe} candles`);
    if (!Array.isArray(data)) return [];

    return (data as unknown[][]).map((k: unknown[]): Candle => ({
      exchange: 'binance',
      marketType: isFutures ? 'futures' : 'spot',
      symbol,
      timeframe,
      time: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      isClosed: true, // REST historical candles are always closed except maybe the last one
      trades: parseInt(k[8] as string, 10),
    }));
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toLocalSymbol(symbol);
    const data = await this.fetch<{
      bids: [string, string][];
      asks: [string, string][];
    }>(`/api/v3/depth?symbol=${local}&limit=${limit}`);

    return {
      symbol,
      exchange: 'binance',
      bids: data.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: data.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT');
  }

  private toBinanceSymbol(symbol: string): string {
    return this.isFuturesSymbol(symbol)
      ? `${symbol.split('/')[0]}USDT`
      : this.toLocalSymbol(symbol);
  }

  private toFuturesSymbol(raw: string): string {
    const base = raw.toUpperCase().replace(/USDT$/, '');
    return `${base}/USDT:USDT`;
  }

  private sendFutures(data: unknown): void {
    if (this.futuresWs && this.futuresConnected) {
      this.futuresWs.send(JSON.stringify(data));
    }
  }

  protected getPingMessage(): null {
    // Binance market-data streams handle WebSocket ping/pong at the protocol
    // level — the `ws` library auto-responds to server ping frames.
    // Sending a custom JSON ping causes Binance to close the connection.
    return null;
  }

  disconnect(): void {
    super.disconnect();
    this.clearControlBatchTimers();
    if (this.futuresWs) {
      this.futuresWs.removeAllListeners();
      this.futuresWs.close();
      this.futuresWs = null;
    }
    this.futuresConnected = false;
    this.futuresSubscriptions.clear();
    this.spotPendingStreams.clear();
    this.futuresPendingStreams.clear();
  }

  private enqueueSpotControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.spotPendingStreams.set(stream, method);
    if (this.spotBatchTimer) return;
    this.spotBatchTimer = setTimeout(() => {
      this.spotBatchTimer = null;
      this.flushSpotControl();
    }, SUBSCRIPTION_BATCH_DELAY_MS);
  }

  private enqueueFuturesControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.futuresPendingStreams.set(stream, method);
    if (this.futuresBatchTimer) return;
    this.futuresBatchTimer = setTimeout(() => {
      this.futuresBatchTimer = null;
      this.flushFuturesControl();
    }, SUBSCRIPTION_BATCH_DELAY_MS);
  }

  private flushSpotControl(): void {
    if (!this.ws || !this.connected || this.spotPendingStreams.size === 0) return;
    for (const [method, params] of this.groupPendingStreams(this.spotPendingStreams)) {
      this.send({ method, params, id: Date.now() });
    }
    this.spotPendingStreams.clear();
  }

  private flushFuturesControl(): void {
    if (!this.futuresWs || !this.futuresConnected || this.futuresPendingStreams.size === 0) return;
    for (const [method, params] of this.groupPendingStreams(this.futuresPendingStreams)) {
      this.sendFutures({ method, params, id: Date.now() });
    }
    this.futuresPendingStreams.clear();
  }

  private groupPendingStreams(
    streams: Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>,
  ): Array<['SUBSCRIBE' | 'UNSUBSCRIBE', string[]]> {
    const groups = new Map<'SUBSCRIBE' | 'UNSUBSCRIBE', string[]>();
    for (const [stream, method] of streams) {
      const params = groups.get(method) || [];
      params.push(stream);
      groups.set(method, params);
    }
    return Array.from(groups.entries());
  }

  private clearControlBatchTimers(): void {
    this.clearSpotControlBatch();
    this.clearFuturesControlBatch();
  }

  private clearSpotControlBatch(): void {
    if (this.spotBatchTimer) {
      clearTimeout(this.spotBatchTimer);
      this.spotBatchTimer = null;
    }
    this.spotPendingStreams.clear();
  }

  private clearFuturesControlBatch(): void {
    if (this.futuresBatchTimer) {
      clearTimeout(this.futuresBatchTimer);
      this.futuresBatchTimer = null;
    }
    this.futuresPendingStreams.clear();
  }

  private async fetchArray<T>(url: string, label: string): Promise<T[]> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`[binance] Failed to fetch ${label}: HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`[binance] Failed to fetch ${label}: unexpected response`);
    }

    return data as T[];
  }
}
