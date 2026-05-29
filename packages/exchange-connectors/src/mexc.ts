// MEXC exchange connector — spot + futures WebSocket

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '1h': 'Min60', '4h': 'Hour4', '1d': 'Day1', '1w': 'Week1',
};

// MEXC REST timeframe map (different from WS)
const REST_TF_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1W',
};

const MEXC_SPOT_WS = 'wss://wbs.mexc.com/ws';
const MEXC_FUTURES_WS = 'wss://contract.mexc.com/edge';
const MEXC_SPOT_REST = 'https://api.mexc.com';
const MEXC_FUTURES_REST = 'https://contract.mexc.com';

export class MexcConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();

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

    // ── Spot WebSocket ─────────────────────────────────────────
    const spotWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(spotWs);
    spotWs.on('close', () => {
      console.warn('[mexc] Spot WS closed');
    });

    // ── Futures WebSocket ──────────────────────────────────────
    const futuresWs = new WebSocket(MEXC_FUTURES_WS);
    this.futuresWs = futuresWs;

    futuresWs.on('open', () => {
      this.futuresConnected = true;
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
    if (this.futuresWs && this.futuresConnected) {
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

    if (isFutures) {
      this.handleFuturesMessage(msg);
      return;
    }

    // Spot messages
    const channel = msg.c as string;
    if (!channel) return;

    if (channel.includes('miniTickers')) {
      const data = msg.d as Record<string, unknown>;
      if (!data) return;
      const rawSymbol = data.s as string;
      if (!rawSymbol?.endsWith('USDT')) return;
      const symbol = normalizeSymbol(rawSymbol, 'mexc');
      const price = parseFloat(data.c as string);
      const open = parseFloat(data.o as string);
      const ticker: Ticker = {
        exchange: 'mexc',
        marketType: 'spot',
        symbol,
        lastPrice: price,
        priceChange24h: price - open,
        volume24h: parseFloat(data.v as string),
        high24h: parseFloat(data.h as string),
        low24h: parseFloat(data.l as string),
        timestamp: Date.now(),
        priceChangePercent24h: ((price - open) / open) * 100,
        quoteVolume24h: parseFloat(data.qv as string),
        trades24h: 0,
        bid: price,
        ask: price,
        spread: 0,
      };
      this.emit('ticker', ticker);
    } else if (channel.includes('kline')) {
      const data = msg.d as Record<string, unknown>;
      if (!data) return;
      const parts = channel.split('@');
      const rawSymbol = parts[2] || '';
      const tf = parts[3] || '1m';
      const symbol = normalizeSymbol(rawSymbol, 'mexc');
      const k = data.k as Record<string, unknown>;
      if (!k) return;
      const candle: Candle = {
        exchange: 'mexc',
        marketType: 'spot',
        symbol,
        timeframe: tf,
        time: k.t as number,
        open: parseFloat(k.o as string),
        high: parseFloat(k.h as string),
        low: parseFloat(k.l as string),
        close: parseFloat(k.c as string),
        volume: parseFloat(k.v as string),
        isClosed: !!(k.X),
        trades: 0,
      };
      this.emit('candle', candle);
    } else if (channel.includes('depth')) {
      const data = msg.d as Record<string, unknown>;
      if (!data) return;
      const parts = channel.split('@');
      const rawSymbol = parts[2] || '';
      const symbol = normalizeSymbol(rawSymbol, 'mexc');
      const bids = ((data.bids || data.b) as [string, string][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      const asks = ((data.asks || data.a) as [string, string][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      this.emit('orderbook', { symbol, exchange: 'mexc', bids, asks, timestamp: Date.now() } as OrderBook);
    } else if (channel.includes('deals')) {
      const data = msg.d as Record<string, unknown>;
      if (!data) return;
      const parts = channel.split('@');
      const rawSymbol = parts[2] || '';
      const symbol = normalizeSymbol(rawSymbol, 'mexc');
      const deals = (data.deals || [data]) as Record<string, unknown>[];
      deals.forEach((t: Record<string, unknown>) => {
        const trade: Trade = {
          id: String(t.i || Date.now()),
          symbol,
          exchange: 'mexc',
          price: parseFloat(t.p as string),
          quantity: parseFloat(t.v as string),
          side: (t.S as number) === 1 ? 'buy' : 'sell',
          timestamp: t.t as number,
        };
        this.emit('trade', trade);
      });
    }
  }

  private handleFuturesMessage(msg: Record<string, unknown>): void {
    const channel = msg.channel as string;
    if (!channel) return;

    if (channel === 'push.ticker') {
      const data = msg.data as Record<string, unknown>;
      if (!data) return;
      const symbol = this.fromMexcFuturesSymbol(data.symbol as string);
      const price = parseFloat(data.lastPrice as string);
      const ticker: Ticker = {
        exchange: 'mexc',
        marketType: 'futures',
        symbol,
        lastPrice: price,
        priceChange24h: parseFloat(data.riseFallValue as string),
        volume24h: parseFloat(data.volume24 as string),
        high24h: parseFloat(data.high24Price as string),
        low24h: parseFloat(data.low24Price as string),
        timestamp: Date.now(),
        priceChangePercent24h: parseFloat(data.riseFallRate as string) * 100,
        quoteVolume24h: parseFloat(data.amount24 as string),
        trades24h: 0,
        bid: price,
        ask: price,
        spread: 0,
      };
      this.emit('ticker', ticker);
    } else if (channel === 'push.kline') {
      const data = msg.data as Record<string, unknown>;
      if (!data) return;
      const symbol = this.fromMexcFuturesSymbol(data.symbol as string);
      const klines = (data.klines || [data]) as Record<string, unknown>[];
      klines.forEach((k: Record<string, unknown>) => {
        const candle: Candle = {
          exchange: 'mexc',
          marketType: 'futures',
          symbol,
          timeframe: data.interval as string || '1m',
          time: (k.time as number) * 1000,
          open: parseFloat(k.open as string),
          high: parseFloat(k.high as string),
          low: parseFloat(k.low as string),
          close: parseFloat(k.close as string),
          volume: parseFloat(k.vol as string),
          isClosed: false, // Contract WS needs additional check for closure
          trades: 0,
        };
        this.emit('candle', candle);
      });
    }
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchArray<Record<string, unknown>>(`${MEXC_SPOT_REST}/api/v3/ticker/24hr`, 'spot tickers'),
      this.fetchArray<Record<string, unknown>>(`${MEXC_FUTURES_REST}/api/v1/contract/ticker`, 'futures tickers'),
    ]);

    const results: Ticker[] = [];

    if (spotRes.status === 'fulfilled') {
      const spot = spotRes.value
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          exchange: 'mexc',
          marketType: 'spot',
          symbol: normalizeSymbol(t.symbol as string, 'mexc'),
          lastPrice: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.priceChange as string),
          volume24h: parseFloat(t.volume as string),
          high24h: parseFloat(t.highPrice as string),
          low24h: parseFloat(t.lowPrice as string),
          timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.priceChangePercent as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: parseInt(t.count as string, 10) || 0,
          bid: parseFloat(t.bidPrice as string),
          ask: parseFloat(t.askPrice as string),
          spread: parseFloat(t.askPrice as string) - parseFloat(t.bidPrice as string),
        }));
      results.push(...spot);
    }

    if (futuresRes.status === 'fulfilled') {
      const list = (futuresRes.value as unknown as { data?: Record<string, unknown>[] }).data || futuresRes.value;
      const futures = (list as Record<string, unknown>[])
        .filter(t => (t.symbol as string)?.endsWith('_USDT'))
        .map((t): Ticker => {
          const price = parseFloat(t.lastPrice as string);
          return {
            exchange: 'mexc',
            marketType: 'futures',
            symbol: this.fromMexcFuturesSymbol(t.symbol as string),
            lastPrice: price,
            priceChange24h: parseFloat(t.riseFallValue as string) || 0,
            volume24h: parseFloat(t.volume24 as string) || 0,
            high24h: parseFloat(t.high24Price as string) || 0,
            low24h: parseFloat(t.low24Price as string) || 0,
            timestamp: Date.now(),
            priceChangePercent24h: parseFloat(t.riseFallRate as string) * 100 || 0,
            quoteVolume24h: parseFloat(t.amount24 as string) || 0,
            trades24h: 0,
            bid: price,
            ask: price,
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
    const tf = REST_TF_MAP[timeframe];

    if (isFutures) {
      const local = this.toMexcFuturesSymbol(symbol);
      const mexcTf = TIMEFRAME_MAP[timeframe];
      let url = `${MEXC_FUTURES_REST}/api/v1/contract/kline/${local}?interval=${mexcTf}&limit=${limit}`;
      if (endTime) url += `&end=${Math.floor(endTime / 1000)}`;
      const data = await this.fetchRaw<{ data?: { time: number[]; open: number[]; high: number[]; low: number[]; close: number[]; vol: number[] } }>(url);
      const d = data.data;
      if (!d?.time) return [];
      return d.time.map((t, i): Candle => ({
        exchange: 'mexc',
        marketType: 'futures',
        symbol,
        timeframe,
        time: t * 1000,
        open: d.open[i],
        high: d.high[i],
        low: d.low[i],
        close: d.close[i],
        volume: d.vol[i],
        isClosed: true,
        trades: 0,
      }));
    }

    const local = this.toMexcSpotSymbol(symbol);
    let url = `${MEXC_SPOT_REST}/api/v3/klines?symbol=${local}&interval=${tf}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchRaw<unknown[][]>(url);
    if (!Array.isArray(data)) return [];
    return data.map((k): Candle => ({
      exchange: 'mexc',
      marketType: 'spot',
      symbol,
      timeframe,
      time: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      isClosed: true,
      trades: 0,
    }));
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toMexcSpotSymbol(symbol);
    const data = await this.fetchRaw<{ bids: [string, string][]; asks: [string, string][] }>(
      `${MEXC_SPOT_REST}/api/v3/depth?symbol=${local}&limit=${limit}`
    );
    return {
      symbol,
      exchange: 'mexc',
      bids: data.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: data.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }

  private async fetchRaw<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`[mexc] HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  private async fetchArray<T>(url: string, label: string): Promise<T[]> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`[mexc] Failed to fetch ${label}: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      // Some endpoints wrap in { data: [] }
      const wrapped = (data as { data?: T[] }).data;
      if (Array.isArray(wrapped)) return wrapped;
      throw new Error(`[mexc] Unexpected response for ${label}`);
    }
    return data as T[];
  }

  disconnect(): void {
    super.disconnect();
    if (this.futuresWs) {
      this.futuresWs.removeAllListeners();
      this.futuresWs.close();
      this.futuresWs = null;
    }
    this.futuresConnected = false;
    this.futuresSubscriptions.clear();
  }
}