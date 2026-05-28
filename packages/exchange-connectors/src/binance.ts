// Binance exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, generateId } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

export class BinanceConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresSubscriptions = new Set<string>();

  constructor() {
    super({
      id: 'binance',
      wsUrl: 'wss://stream.binance.com:9443/ws',
      restUrl: 'https://api.binance.com',
      rateLimit: 1200,
    });
  }

  async connectWS(): Promise<void> {
    const ws = new WebSocket(this.wsUrl);
    this.setupWebSocket(ws);
    return new Promise((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });
  }

  protected getPingMessage(): unknown | null {
    return null;
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT');
  }

  private toFuturesLocalSymbol(symbol: string): string {
    return `${symbol.split('/')[0]}USDT`.toLowerCase();
  }

  private ensureFuturesWS(): void {
    if (this.futuresWs && (this.futuresConnected || this.futuresWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const ws = new WebSocket('wss://fstream.binance.com/ws');
    this.futuresWs = ws;

    ws.on('open', () => {
      this.futuresConnected = true;
      for (const key of this.futuresSubscriptions) {
        const [, symbol, timeframe] = JSON.parse(key) as [string, string, Timeframe];
        this.sendFuturesSubscribe(symbol, timeframe as Timeframe);
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        const eventType = msg.e as string;
        if (eventType === 'kline') this.handleFuturesKline(msg);
      } catch {
        // ignore malformed exchange payloads
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.futuresConnected = false;
      console.warn('[binance:futures] websocket closed', code, reason.toString());
      if (this.futuresSubscriptions.size > 0) {
        this.futuresReconnectTimer = setTimeout(() => this.ensureFuturesWS(), 3000);
      }
    });

    ws.on('error', (err: Error) => this.emit('error', err));
  }

  private sendFutures(data: unknown): void {
    if (this.futuresWs && this.futuresConnected && this.futuresWs.readyState === WebSocket.OPEN) {
      this.futuresWs.send(JSON.stringify(data));
    }
  }

  private sendFuturesSubscribe(symbol: string, timeframe: Timeframe): void {
    const local = this.toFuturesLocalSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    this.sendFutures({ method: 'SUBSCRIBE', params: [`${local}@kline_${tf}`], id: Date.now() });
  }

  private handleFuturesKline(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown>;
    if (!k) return;
    const raw = k.s as string;
    const base = raw.slice(0, -4);
    const candle: Candle & { symbol: string; timeframe: string; exchange: string; finalized: boolean } = {
      symbol: `${base}/USDT:USDT`,
      exchange: 'binance',
      timeframe: k.i as string,
      timestamp: k.t as number,
      open: parseFloat(k.o as string),
      high: parseFloat(k.h as string),
      low: parseFloat(k.l as string),
      close: parseFloat(k.c as string),
      volume: parseFloat(k.v as string),
      trades: parseInt(k.n as string, 10),
      finalized: k.x as boolean,
    };
    this.emit('candle', candle);
  }

  subscribeTicker(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIBE', params: [`${local}@ticker`], id: Date.now() });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const key = JSON.stringify(['futures-candle', symbol, timeframe]);
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.ensureFuturesWS();
      this.sendFuturesSubscribe(symbol, timeframe);
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    const tf = TIMEFRAME_MAP[timeframe];
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIBE', params: [`${local}@kline_${tf}`], id: Date.now() });
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIBE', params: [`${local}@depth20@100ms`], id: Date.now() });
  }

  subscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIBE', params: [`${local}@trade`], id: Date.now() });
  }

  unsubscribeTicker(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`ticker:${symbol}`);
    this.send({ method: 'UNSUBSCRIBE', params: [`${local}@ticker`], id: Date.now() });
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const key = JSON.stringify(['futures-candle', symbol, timeframe]);
      this.futuresSubscriptions.delete(key);
      const local = this.toFuturesLocalSymbol(symbol);
      const tf = TIMEFRAME_MAP[timeframe];
      this.sendFutures({ method: 'UNSUBSCRIBE', params: [`${local}@kline_${tf}`], id: Date.now() });
      return;
    }

    const local = this.toLocalSymbol(symbol).toLowerCase();
    const tf = TIMEFRAME_MAP[timeframe];
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.send({ method: 'UNSUBSCRIBE', params: [`${local}@kline_${tf}`], id: Date.now() });
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({ method: 'UNSUBSCRIBE', params: [`${local}@depth20@100ms`], id: Date.now() });
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    this.subscriptions.delete(`trades:${symbol}`);
    this.send({ method: 'UNSUBSCRIBE', params: [`${local}@trade`], id: Date.now() });
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
    const symbol = this.fromLocalSymbol(data.s as string);
    const ticker: Ticker = {
      symbol,
      exchange: 'binance',
      price: parseFloat(data.c as string),
      priceChange24h: parseFloat(data.p as string),
      priceChangePercent24h: parseFloat(data.P as string),
      high24h: parseFloat(data.h as string),
      low24h: parseFloat(data.l as string),
      volume24h: parseFloat(data.v as string),
      quoteVolume24h: parseFloat(data.q as string),
      trades24h: parseInt(data.n as string, 10),
      bid: parseFloat(data.b as string),
      ask: parseFloat(data.a as string),
      spread: parseFloat(data.a as string) - parseFloat(data.b as string),
      lastUpdate: Date.now(),
    };
    this.emit('ticker', ticker);
  }

  private handleKline(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown>;
    if (!k) return;
    const symbol = this.fromLocalSymbol(k.s as string);
    const candle: Candle & { symbol: string; timeframe: string; exchange: string; finalized: boolean } = {
      symbol,
      exchange: 'binance',
      timeframe: k.i as string,  // e.g. "1h", "5m"
      timestamp: k.t as number,
      open: parseFloat(k.o as string),
      high: parseFloat(k.h as string),
      low: parseFloat(k.l as string),
      close: parseFloat(k.c as string),
      volume: parseFloat(k.v as string),
      trades: parseInt(k.n as string, 10),
      finalized: k.x as boolean,
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
      fetch(`${this.restUrl}/api/v3/ticker/24hr`).then(r => r.json()) as Promise<Record<string, unknown>[]>,
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr').then(r => r.json()) as Promise<Record<string, unknown>[]>,
    ]);

    const results: Ticker[] = [];

    if (spotRes.status === 'fulfilled') {
      const spot = spotRes.value
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          symbol: normalizeSymbol(t.symbol as string, 'binance'),
          exchange: 'binance',
          price: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.priceChange as string),
          priceChangePercent24h: parseFloat(t.priceChangePercent as string),
          high24h: parseFloat(t.highPrice as string),
          low24h: parseFloat(t.lowPrice as string),
          volume24h: parseFloat(t.volume as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: parseInt(t.count as string, 10),
          bid: parseFloat(t.bidPrice as string),
          ask: parseFloat(t.askPrice as string),
          spread: parseFloat(t.askPrice as string) - parseFloat(t.bidPrice as string),
          lastUpdate: Date.now(),
        }));
      results.push(...spot);
    }

    if (futuresRes.status === 'fulfilled') {
      const futures = futuresRes.value
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => {
          const raw = t.symbol as string;
          // BTCUSDT -> BTC/USDT:USDT (CCXT perpetual format)
          const base = raw.slice(0, -4);
          const symbol = `${base}/USDT:USDT`;
          const lastPrice = parseFloat(t.lastPrice as string);
          return {
            symbol,
            exchange: 'binance',
            price: lastPrice,
            priceChange24h: parseFloat(t.priceChange as string),
            priceChangePercent24h: parseFloat(t.priceChangePercent as string),
            high24h: parseFloat(t.highPrice as string),
            low24h: parseFloat(t.lowPrice as string),
            volume24h: parseFloat(t.volume as string),
            quoteVolume24h: parseFloat(t.quoteVolume as string),
            trades24h: parseInt(t.count as string, 10),
            bid: lastPrice,
            ask: lastPrice,
            spread: 0,
            lastUpdate: Date.now(),
          };
        });
      results.push(...futures);
    }

    if (symbols) return results.filter(t => symbols.includes(t.symbol));
    return results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const isFutures = symbol.includes(':USDT');
    // For futures: BTC/USDT:USDT -> BTCUSDT, for spot: BTC/USDT -> BTCUSDT
    const local = isFutures
      ? symbol.split('/')[0] + 'USDT'
      : this.toLocalSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const baseUrl = isFutures ? 'https://fapi.binance.com' : this.restUrl;
    const path = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';
    let url = `${baseUrl}${path}?symbol=${local}&interval=${tf}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;

    const data = await fetch(url).then(r => r.json()) as unknown[];

    return (data as unknown[][]).map((k: unknown[]): Candle => ({
      timestamp: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
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

  override disconnect(): void {
    super.disconnect();
    if (this.futuresReconnectTimer) {
      clearTimeout(this.futuresReconnectTimer);
      this.futuresReconnectTimer = null;
    }
    if (this.futuresWs) {
      this.futuresWs.removeAllListeners();
      this.futuresWs.close();
      this.futuresWs = null;
    }
    this.futuresConnected = false;
    this.futuresSubscriptions.clear();
  }
}
