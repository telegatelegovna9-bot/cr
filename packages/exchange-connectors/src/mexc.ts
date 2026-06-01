// MEXC exchange connector — spot + futures WebSocket

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '1h': 'Min60', '4h': 'Hour4', '1d': 'Day1', '1w': 'Week1',
};

const REST_TF_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '60m', '4h': '4h', '1d': '1d', '1w': '1W',
};

const MEXC_SPOT_WS = 'wss://wbs-api.mexc.com/ws';
const MEXC_FUTURES_WS = 'wss://contract.mexc.com/edge';
const MEXC_SPOT_REST = 'https://api.mexc.com';
const MEXC_FUTURES_REST = 'https://contract.mexc.com';

export class MexcConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();
  private futuresHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private spotHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'mexc',
      wsUrl: MEXC_SPOT_WS,
      restUrl: MEXC_SPOT_REST,
      rateLimit: 600,
    });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return;

    const spotWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(spotWs);
    spotWs.on('close', () => {
      console.warn('[mexc] Spot WS closed');
      this.stopSpotHeartbeat();
    });
    spotWs.on('open', () => {
      this.startSpotHeartbeat();
    });

    const futuresWs = new WebSocket(MEXC_FUTURES_WS);
    this.futuresWs = futuresWs;

    futuresWs.on('open', () => {
      this.futuresConnected = true;
      this.startFuturesHeartbeat();
    });
    futuresWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        msg.__marketType = 'futures';
        this.handleMessage(msg);
      } catch { /* ignore */ }
    });
    futuresWs.on('close', () => {
      this.futuresConnected = false;
      this.futuresSubscriptions.clear();
      this.stopFuturesHeartbeat();
    });
    futuresWs.on('error', (err: Error) => {
      console.warn(`[mexc] Futures WS error: ${err.message}`);
    });

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      const done = () => { clearTimeout(timer); resolve(); };
      spotWs.once('open', done);
      spotWs.once('error', done);
      spotWs.once('close', done);
    });
  }

  private startSpotHeartbeat(): void {
    this.stopSpotHeartbeat();
    this.spotHeartbeatTimer = setInterval(() => {
      if (this.ws && this.connected && this.ws.readyState === 1) {
        this.send({ method: 'PING' });
      }
    }, 20000);
  }

  private stopSpotHeartbeat(): void {
    if (this.spotHeartbeatTimer) {
      clearInterval(this.spotHeartbeatTimer);
      this.spotHeartbeatTimer = null;
    }
  }

  private startFuturesHeartbeat(): void {
    this.stopFuturesHeartbeat();
    this.futuresHeartbeatTimer = setInterval(() => {
      if (this.futuresWs && this.futuresConnected && this.futuresWs.readyState === 1) {
        this.futuresWs.send(JSON.stringify({ method: 'ping' }));
      }
    }, 20000);
  }

  private stopFuturesHeartbeat(): void {
    if (this.futuresHeartbeatTimer) {
      clearInterval(this.futuresHeartbeatTimer);
      this.futuresHeartbeatTimer = null;
    }
  }

  protected getPingMessage(): unknown {
    return { method: 'PING' };
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT') || symbol.includes(':USD');
  }

  private toMexcFuturesSymbol(symbol: string): string {
    return `${symbol.split('/')[0]}_USDT`;
  }

  private fromMexcFuturesSymbol(raw: string): string {
    const base = raw.replace('_USDT', '');
    return `${base}/USDT:USDT`;
  }

  private toMexcSpotSymbol(symbol: string): string {
    return symbol.replace('/', '');
  }

  private sendFutures(data: unknown): void {
    if (this.futuresWs && this.futuresConnected && this.futuresWs.readyState === 1) {
      this.futuresWs.send(JSON.stringify(data));
    }
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const key = `ticker:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.sendFutures({ method: 'sub.ticker', param: { symbol: local } });
      return;
    }
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIPTION', params: [`spot@public.miniTickers.v3.api@UTC+8`] });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const tf = TIMEFRAME_MAP[timeframe];
      const key = `candle:${symbol}:${timeframe}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.sendFutures({ method: 'sub.kline', param: { symbol: local, interval: tf } });
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    const tf = REST_TF_MAP[timeframe];
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIPTION', params: [`spot@public.kline.v3.api@${local}@${tf}`] });
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toMexcSpotSymbol(symbol);
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIPTION', params: [`spot@public.limit.depth.v3.api@${local}@20`] });
  }

  subscribeTrades(symbol: string): void {
    const local = this.toMexcSpotSymbol(symbol);
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIPTION', params: [`spot@public.deals.v3.api@${local}`] });
  }

  unsubscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`ticker:${symbol}`);
      this.sendFutures({ method: 'unsub.ticker', param: { symbol: local } });
      return;
    }
    this.subscriptions.delete(`ticker:${symbol}`);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const tf = TIMEFRAME_MAP[timeframe];
      this.futuresSubscriptions.delete(`candle:${symbol}:${timeframe}`);
      this.sendFutures({ method: 'unsub.kline', param: { symbol: local, interval: tf } });
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    const tf = REST_TF_MAP[timeframe];
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.send({ method: 'UNSUBSCRIPTION', params: [`spot@public.kline.v3.api@${local}@${tf}`] });
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toMexcSpotSymbol(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({ method: 'UNSUBSCRIPTION', params: [`spot@public.limit.depth.v3.api@${local}@20`] });
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toMexcSpotSymbol(symbol);
    this.subscriptions.delete(`trades:${symbol}`);
    this.send({ method: 'UNSUBSCRIPTION', params: [`spot@public.deals.v3.api@${local}`] });
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    const isFutures = msg.__marketType === 'futures';
    if (isFutures) { this.handleFuturesMessage(msg); return; }
    const channel = msg.c as string;
    if (!channel) return;
    if (channel.includes('miniTickers')) {
      const d = msg.d; if (!d) return;
      (Array.isArray(d) ? d : [d]).forEach((data: any) => {
        if (!data.s?.endsWith('USDT')) return;
        const symbol = normalizeSymbol(data.s, 'mexc');
        const price = parseFloat(data.c); const open = parseFloat(data.o);
        this.emit('ticker', {
          exchange: 'mexc', marketType: 'spot', symbol, lastPrice: price, priceChange24h: price - open,
          volume24h: parseFloat(data.v), high24h: parseFloat(data.h), low24h: parseFloat(data.l),
          timestamp: Date.now(), priceChangePercent24h: ((price - open) / open) * 100,
          quoteVolume24h: parseFloat(data.qv), trades24h: 0, bid: price, ask: price, spread: 0,
        } as Ticker);
      });
    } else if (channel.includes('kline')) {
      const data = msg.d as any; if (!data?.k) return;
      const parts = channel.split('@');
      this.emit('candle', {
        exchange: 'mexc', marketType: 'spot', symbol: normalizeSymbol(parts[2], 'mexc'), timeframe: parts[3] || '1m',
        time: data.k.t, open: parseFloat(data.k.o), high: parseFloat(data.k.h), low: parseFloat(data.k.l),
        close: parseFloat(data.k.c), volume: parseFloat(data.k.v), isClosed: !!data.k.X, trades: 0,
      } as Candle);
    } else if (channel.includes('depth')) {
      const data = msg.d as any; if (!data) return;
      const parts = channel.split('@');
      this.emit('orderbook', {
        symbol: normalizeSymbol(parts[2], 'mexc'), exchange: 'mexc', marketType: 'spot',
        bids: (data.b || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: (data.a || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      } as OrderBook);
    } else if (channel.includes('deals')) {
      const data = msg.d as any; if (!data) return;
      const parts = channel.split('@');
      (data.deals || [data]).forEach((t: any) => {
        this.emit('trade', {
          id: String(t.i || Date.now()), symbol: normalizeSymbol(parts[2], 'mexc'), exchange: 'mexc',
          price: parseFloat(t.p), quantity: parseFloat(t.v), side: t.S === 1 ? 'buy' : 'sell', timestamp: t.t,
        } as Trade);
      });
    }
  }

  private handleFuturesMessage(msg: Record<string, unknown>): void {
    const channel = msg.channel as string; if (!channel || !msg.data) return;
    const data = msg.data as any;
    if (channel === 'push.ticker') {
      const symbol = this.fromMexcFuturesSymbol(data.symbol);
      const price = parseFloat(data.lastPrice);
      this.emit('ticker', {
        exchange: 'mexc', marketType: 'futures', symbol, lastPrice: price, priceChange24h: parseFloat(data.riseFallValue),
        volume24h: parseFloat(data.volume24), high24h: parseFloat(data.high24Price), low24h: parseFloat(data.low24Price),
        timestamp: Date.now(), priceChangePercent24h: parseFloat(data.riseFallRate) * 100,
        quoteVolume24h: parseFloat(data.amount24), trades24h: 0, bid: price, ask: price, spread: 0,
      } as Ticker);
    } else if (channel === 'push.kline') {
      const symbol = this.fromMexcFuturesSymbol(data.symbol);
      (data.klines || [data]).forEach((k: any) => {
        this.emit('candle', {
          exchange: 'mexc', marketType: 'futures', symbol, timeframe: data.interval || '1m', time: k.time * 1000,
          open: parseFloat(k.open), high: parseFloat(k.high), low: parseFloat(k.low), close: parseFloat(k.close),
          volume: parseFloat(k.vol), isClosed: false, trades: 0,
        } as Candle);
      });
    }
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchArray<any>(`${MEXC_SPOT_REST}/api/v3/ticker/24hr`, 'spot tickers'),
      this.fetchArray<any>(`${MEXC_FUTURES_REST}/api/v1/contract/ticker`, 'futures tickers'),
    ]);
    const results: Ticker[] = [];
    if (spotRes.status === 'fulfilled') {
      results.push(...spotRes.value.filter(t => t.symbol.endsWith('USDT')).map((t: any): Ticker => ({
        exchange: 'mexc', marketType: 'spot', symbol: normalizeSymbol(t.symbol, 'mexc'),
        lastPrice: parseFloat(t.lastPrice), priceChange24h: parseFloat(t.priceChange), volume24h: parseFloat(t.volume),
        high24h: parseFloat(t.highPrice), low24h: parseFloat(t.lowPrice), timestamp: Date.now(),
        priceChangePercent24h: parseFloat(t.priceChangePercent), quoteVolume24h: parseFloat(t.quoteVolume),
        trades24h: parseInt(t.count, 10) || 0, bid: parseFloat(t.bidPrice), ask: parseFloat(t.askPrice), spread: parseFloat(t.askPrice) - parseFloat(t.bidPrice),
      })));
    }
    if (futuresRes.status === 'fulfilled') {
      const list = futuresRes.value.data || futuresRes.value;
      results.push(...list.filter((t: any) => t.symbol.endsWith('_USDT')).map((t: any): Ticker => {
        const price = parseFloat(t.lastPrice);
        return {
          exchange: 'mexc', marketType: 'futures', symbol: this.fromMexcFuturesSymbol(t.symbol), lastPrice: price,
          priceChange24h: parseFloat(t.riseFallValue) || 0, volume24h: parseFloat(t.volume24) || 0,
          high24h: parseFloat(t.high24Price) || 0, low24h: parseFloat(t.low24Price) || 0, timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.riseFallRate) * 100 || 0, quoteVolume24h: parseFloat(t.amount24) || 0,
          trades24h: 0, bid: price, ask: price, spread: 0,
        };
      }));
    }
    return symbols ? results.filter(t => symbols.includes(t.symbol)) : results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    if (isFutures) {
      const local = this.toMexcFuturesSymbol(symbol);
      let url = `${MEXC_FUTURES_REST}/api/v1/contract/kline/${local}?interval=${TIMEFRAME_MAP[timeframe]}&limit=${limit}`;
      if (endTime) url += `&end=${Math.floor(endTime / 1000)}`;
      const data = await this.fetchRaw<any>(url); if (!data?.data?.time) return [];
      return data.data.time.map((t: any, i: number) => ({
        exchange: 'mexc', marketType: 'futures', symbol, timeframe, time: t * 1000,
        open: data.data.open[i], high: data.data.high[i], low: data.data.low[i], close: data.data.close[i], volume: data.data.vol[i], isClosed: true, trades: 0,
      }));
    }
    const local = this.toMexcSpotSymbol(symbol);
    let url = `${MEXC_SPOT_REST}/api/v3/klines?symbol=${local}&interval=${REST_TF_MAP[timeframe]}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchRaw<any>(url); if (!Array.isArray(data)) return [];
    return data.map((k: any) => ({
      exchange: 'mexc', marketType: 'spot', symbol, timeframe, time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]), isClosed: true, trades: 0,
    }));
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toMexcSpotSymbol(symbol);
    const data = await this.fetchRaw<any>(`${MEXC_SPOT_REST}/api/v3/depth?symbol=${local}&limit=${limit}`);
    return {
      symbol, exchange: 'mexc', bids: (data.bids || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: (data.asks || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })), timestamp: Date.now(),
    };
  }

  private get spotHeaders() { return { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }; }

  private async fetchRaw<T>(url: string): Promise<T> {
    const headers = url.includes('api.mexc.com') ? this.spotHeaders : { Accept: 'application/json' };
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`[mexc] HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async fetchArray<T>(url: string, label: string): Promise<T[]> {
    const data = await this.fetchRaw<any>(url);
    return Array.isArray(data) ? data : data.data || [];
  }

  disconnect(): void {
    super.disconnect(); this.stopFuturesHeartbeat(); this.stopSpotHeartbeat();
    if (this.futuresWs) { this.futuresWs.removeAllListeners(); this.futuresWs.close(); this.futuresWs = null; }
    this.futuresConnected = false; this.futuresSubscriptions.clear();
  }
}
