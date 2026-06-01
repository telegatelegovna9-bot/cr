// Binance exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, WS_RECONNECT_DELAY } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const BINANCE_SPOT_WS_URL = 'wss://stream.binance.com:9443/ws';
const BINANCE_FUTURES_WS_URL = 'wss://fstream.binance.com/ws';
const BINANCE_SPOT_REST_URL = 'https://api.binance.com';
const BINANCE_FUTURES_REST_URL = 'https://fapi.binance.com';
const SUBSCRIPTION_BATCH_DELAY_MS = 250;

export class BinanceConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();
  private activeFuturesSubs = new Set<string>();
  private futuresReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private spotPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private futuresPendingStreams = new Map<string, 'SUBSCRIBE' | 'UNSUBSCRIBE'>();
  private spotBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({ id: 'binance', wsUrl: BINANCE_SPOT_WS_URL, restUrl: BINANCE_SPOT_REST_URL, rateLimit: 1200 });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return;
    const spotWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(spotWs);
    const futuresWs = new WebSocket(BINANCE_FUTURES_WS_URL);
    this.setupFuturesWS(futuresWs);
    await Promise.allSettled([
      new Promise<void>(res => { const t = setTimeout(res, 10000); spotWs.once('open', () => { clearTimeout(t); res(); }); }),
      new Promise<void>(res => { const t = setTimeout(res, 10000); futuresWs.once('open', () => { clearTimeout(t); res(); }); })
    ]);
  }

  private setupFuturesWS(ws: WebSocket): void {
    this.futuresWs = ws;
    ws.on('open', () => {
      this.futuresConnected = true;
      for (const s of this.activeFuturesSubs) this.enqueueFuturesControl('SUBSCRIBE', s);
    });
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        msg.__marketType = 'futures';
        if (msg.data && typeof msg.data === 'object') msg.data.__marketType = 'futures';
        this.handleMessage(msg);
      } catch { /* ignore */ }
    });
    ws.on('close', () => {
      this.futuresConnected = false; this.futuresWs = null; this.futuresSubscriptions.clear(); this.clearFuturesControlBatch();
      if (!this.futuresReconnectTimer) this.futuresReconnectTimer = setTimeout(() => { this.futuresReconnectTimer = null; this.reconnectFuturesWS(); }, WS_RECONNECT_DELAY);
    });
    ws.on('error', (err: Error) => console.warn(`[binance] Futures WS error: ${err.message}`));
    ws.on('unexpected-response', (_req, res) => { if (res.statusCode === 451) { console.error('[binance] Futures blocked (451)'); this.futuresWs?.close(); } });
  }

  private reconnectFuturesWS(): void { if (this.futuresWs) return; this.setupFuturesWS(new WebSocket(BINANCE_FUTURES_WS_URL)); }

  private isFuturesSymbol(s: string): boolean { const u = s.toUpperCase(); return u.includes(':USDT') || u.includes(':USD'); }

  private toBinanceSymbol(s: string): string {
    const isF = this.isFuturesSymbol(s);
    const base = s.includes('/') ? s.split('/')[0] : s.split(':')[0];
    return isF ? `${base}USDT` : this.toLocalSymbol(s);
  }

  private toFuturesSymbol(raw: string): string { const base = raw.toUpperCase().replace(/USDT$/, ''); return `${base}/USDT:USDT`; }

  subscribeTicker(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      if (this.futuresSubscriptions.has(`ticker:${s}`)) return;
      this.futuresSubscriptions.add(`ticker:${s}`); this.activeFuturesSubs.add(`${local}@ticker`);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@ticker`);
    } else {
      if (this.subscriptions.has(`ticker:${s}`)) return;
      this.subscriptions.add(`ticker:${s}`); this.enqueueSpotControl('SUBSCRIBE', `${local}@ticker`);
    }
  }

  subscribeCandle(s: string, tf: Timeframe): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    const interval = TIMEFRAME_MAP[tf];
    if (this.isFuturesSymbol(s)) {
      if (this.futuresSubscriptions.has(`candle:${s}:${tf}`)) return;
      this.futuresSubscriptions.add(`candle:${s}:${tf}`); this.activeFuturesSubs.add(`${local}@kline_${interval}`);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@kline_${interval}`);
    } else {
      if (this.subscriptions.has(`candle:${s}:${tf}`)) return;
      this.subscriptions.add(`candle:${s}:${tf}`); this.enqueueSpotControl('SUBSCRIBE', `${local}@kline_${interval}`);
    }
  }

  subscribeOrderBook(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      if (this.futuresSubscriptions.has(`orderbook:${s}`)) return;
      this.futuresSubscriptions.add(`orderbook:${s}`); this.activeFuturesSubs.add(`${local}@depth@100ms`);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@depth@100ms`);
    } else {
      if (this.subscriptions.has(`orderbook:${s}`)) return;
      this.subscriptions.add(`orderbook:${s}`); this.enqueueSpotControl('SUBSCRIBE', `${local}@depth@100ms`);
    }
  }

  subscribeTrades(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      if (this.futuresSubscriptions.has(`trades:${s}`)) return;
      this.futuresSubscriptions.add(`trades:${s}`); this.activeFuturesSubs.add(`${local}@aggTrade`);
      this.enqueueFuturesControl('SUBSCRIBE', `${local}@aggTrade`);
    } else {
      if (this.subscriptions.has(`trades:${s}`)) return;
      this.subscriptions.add(`trades:${s}`); this.enqueueSpotControl('SUBSCRIBE', `${local}@aggTrade`);
    }
  }

  unsubscribeTicker(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      this.futuresSubscriptions.delete(`ticker:${s}`); this.activeFuturesSubs.delete(`${local}@ticker`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@ticker`);
    } else {
      this.subscriptions.delete(`ticker:${s}`); this.enqueueSpotControl('UNSUBSCRIBE', `${local}@ticker`);
    }
  }

  unsubscribeCandle(s: string, tf: Timeframe): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    const interval = TIMEFRAME_MAP[tf];
    if (this.isFuturesSymbol(s)) {
      this.futuresSubscriptions.delete(`candle:${s}:${tf}`); this.activeFuturesSubs.delete(`${local}@kline_${interval}`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@kline_${interval}`);
    } else {
      this.subscriptions.delete(`candle:${s}:${tf}`); this.enqueueSpotControl('UNSUBSCRIBE', `${local}@kline_${interval}`);
    }
  }

  unsubscribeOrderBook(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      this.futuresSubscriptions.delete(`orderbook:${s}`); this.activeFuturesSubs.delete(`${local}@depth@100ms`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@depth@100ms`);
    } else {
      this.subscriptions.delete(`orderbook:${s}`); this.enqueueSpotControl('UNSUBSCRIBE', `${local}@depth@100ms`);
    }
  }

  unsubscribeTrades(s: string): void {
    const local = this.toBinanceSymbol(s).toLowerCase();
    if (this.isFuturesSymbol(s)) {
      this.futuresSubscriptions.delete(`trades:${s}`); this.activeFuturesSubs.delete(`${local}@aggTrade`);
      this.enqueueFuturesControl('UNSUBSCRIBE', `${local}@aggTrade`);
    } else {
      this.subscriptions.delete(`trades:${s}`); this.enqueueSpotControl('UNSUBSCRIBE', `${local}@aggTrade`);
    }
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    if (msg.error || (!msg.e && !msg.data && !msg.stream)) return;
    const data = (msg.data as Record<string, unknown>) || msg;
    const eventType = (data.e as string) || (msg.e as string);
    if (!data.__marketType) data.__marketType = msg.__marketType;
    switch (eventType) {
      case '24hrTicker': this.handleTicker(data); break;
      case 'kline': this.handleKline(data); break;
      case 'depthUpdate': this.handleDepthUpdate(data); break;
      case 'trade': case 'aggTrade': this.handleTrade(data); break;
    }
  }

  private handleTicker(data: Record<string, unknown>): void {
    const isF = data.__marketType === 'futures';
    this.emit('ticker', {
      exchange: 'binance', marketType: isF ? 'futures' : 'spot', symbol: isF ? this.toFuturesSymbol(data.s as string) : this.fromLocalSymbol(data.s as string),
      lastPrice: parseFloat(data.c as string), priceChange24h: parseFloat(data.p as string), volume24h: parseFloat(data.v as string),
      high24h: parseFloat(data.h as string), low24h: parseFloat(data.l as string), timestamp: Date.now(),
      priceChangePercent24h: parseFloat(data.P as string), quoteVolume24h: parseFloat(data.q as string),
      trades24h: parseInt(data.n as string, 10), bid: parseFloat(data.b as string), ask: parseFloat(data.a as string),
      spread: parseFloat(data.a as string) - parseFloat(data.b as string),
    } as Ticker);
  }

  private handleKline(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown>; if (!k) return;
    const isF = data.__marketType === 'futures';
    this.emit('candle', {
      exchange: 'binance', marketType: isF ? 'futures' : 'spot', symbol: isF ? this.toFuturesSymbol(k.s as string) : this.fromLocalSymbol(k.s as string),
      timeframe: k.i as string, time: k.t as number, open: parseFloat(k.o as string), high: parseFloat(k.h as string),
      low: parseFloat(k.l as string), close: parseFloat(k.c as string), volume: parseFloat(k.v as string),
      isClosed: k.x as boolean, trades: parseInt(k.n as string, 10),
    } as Candle);
  }

  private handleDepthUpdate(data: Record<string, unknown>): void {
    const isF = data.__marketType === 'futures';
    let rawSymbol = (data.s as string) || '';
    if (!rawSymbol && data.__stream) rawSymbol = (data.__stream as string).split('@')[0].toUpperCase();
    const symbol = rawSymbol ? (isF ? this.toFuturesSymbol(rawSymbol) : this.fromLocalSymbol(rawSymbol)) : 'unknown';
    const bids = ((data.bids || data.b) as [string, string][] || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })).filter(l => l.quantity > 0);
    const asks = ((data.asks || data.a) as [string, string][] || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })).filter(l => l.quantity > 0);
    if (symbol !== 'unknown' && (bids.length || asks.length)) this.emit('orderbook', { symbol, exchange: 'binance', marketType: isF ? 'futures' : 'spot', bids, asks, timestamp: Date.now() } as OrderBook);
  }

  private handleTrade(data: Record<string, unknown>): void {
    const isF = data.__marketType === 'futures';
    this.emit('trade', {
      id: String(data.t || data.a), symbol: isF ? this.toFuturesSymbol(data.s as string) : this.fromLocalSymbol(data.s as string),
      exchange: 'binance', marketType: isF ? 'futures' : 'spot', price: parseFloat(data.p as string), quantity: parseFloat(data.q as string),
      side: data.m ? 'sell' : 'buy', timestamp: (data.T || data.E) as number,
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

  async fetchCandles(s: string, tf: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const isF = this.isFuturesSymbol(s);
    const tfBinance = TIMEFRAME_MAP[tf];
    let url = `${isF ? BINANCE_FUTURES_REST_URL : this.restUrl}${isF ? '/fapi/v1/klines' : '/api/v3/klines'}?symbol=${this.toBinanceSymbol(s)}&interval=${tfBinance}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchArray<any[]>(url, `${s} candles`);
    return data.map(k => ({
      exchange: 'binance', marketType: isF ? 'futures' : 'spot', symbol: s, timeframe: tf, time: k[0],
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5]), isClosed: true, trades: parseInt(k[8], 10),
    }));
  }

  async fetchOrderBook(s: string, limit = 50): Promise<OrderBook> {
    const local = this.toLocalSymbol(s);
    const data = await this.fetch<any>(`/api/v3/depth?symbol=${local}&limit=${limit}`);
    return { symbol: s, exchange: 'binance', bids: data.bids.map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })), asks: data.asks.map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })), timestamp: Date.now() };
  }

  private sendFutures(data: unknown): void { if (this.futuresWs && this.futuresWs.readyState === 1) this.futuresWs.send(JSON.stringify(data)); }

  protected getPingMessage(): null { return null; }

  disconnect(): void {
    super.disconnect(); this.clearControlBatchTimers();
    if (this.futuresWs) { this.futuresWs.removeAllListeners(); this.futuresWs.close(); this.futuresWs = null; }
    this.futuresConnected = false; this.futuresSubscriptions.clear(); this.activeFuturesSubs.clear();
  }

  private enqueueSpotControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.spotPendingStreams.set(stream, method);
    if (!this.spotBatchTimer) this.spotBatchTimer = setTimeout(() => { this.spotBatchTimer = null; this.flushSpotControl(); }, SUBSCRIPTION_BATCH_DELAY_MS);
  }

  private flushSpotControl(): void {
    if (!this.ws || !this.connected || this.spotPendingStreams.size === 0) return;
    for (const [m, p] of this.groupPendingStreams(this.spotPendingStreams)) this.send({ method: m, params: p, id: Date.now() });
    this.spotPendingStreams.clear();
  }

  private enqueueFuturesControl(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', stream: string): void {
    this.futuresPendingStreams.set(stream, method);
    if (!this.futuresBatchTimer) this.futuresBatchTimer = setTimeout(() => { this.futuresBatchTimer = null; this.flushFuturesControl(); }, SUBSCRIPTION_BATCH_DELAY_MS);
  }

  private flushFuturesControl(): void {
    if (!this.futuresWs || this.futuresWs.readyState !== 1 || this.futuresPendingStreams.size === 0) {
      if (this.futuresPendingStreams.size > 0 && (!this.futuresWs || this.futuresWs.readyState !== 1)) {
        if (!this.futuresBatchTimer) this.futuresBatchTimer = setTimeout(() => { this.futuresBatchTimer = null; this.flushFuturesControl(); }, 1000);
      }
      return;
    }
    for (const [m, p] of this.groupPendingStreams(this.futuresPendingStreams)) this.sendFutures({ method: m, params: p, id: Date.now() });
    this.futuresPendingStreams.clear();
  }

  private groupPendingStreams(streams: Map<string, any>): Array<[any, string[]]> {
    const groups = new Map<any, string[]>();
    for (const [s, m] of streams) { const p = groups.get(m) || []; p.push(s); groups.set(m, p); }
    return Array.from(groups.entries());
  }

  private clearControlBatchTimers(): void { if (this.spotBatchTimer) { clearTimeout(this.spotBatchTimer); this.spotBatchTimer = null; } if (this.futuresBatchTimer) { clearTimeout(this.futuresBatchTimer); this.futuresBatchTimer = null; } }

  private async fetchArray<T>(url: string, label: string): Promise<T[]> {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`[binance] HTTP ${r.status}`);
    const data = await r.json(); return Array.isArray(data) ? data : data.data || [];
  }

  private clearFuturesControlBatch(): void { if (this.futuresBatchTimer) { clearTimeout(this.futuresBatchTimer); this.futuresBatchTimer = null; } this.futuresPendingStreams.clear(); }
}
