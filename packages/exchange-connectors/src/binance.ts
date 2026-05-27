// Binance exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, generateId } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

export class BinanceConnector extends BaseExchangeConnector {
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

  subscribeTicker(symbol: string): void {
    const local = this.toLocalSymbol(symbol).toLowerCase();
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ method: 'SUBSCRIBE', params: [`${local}@ticker`], id: Date.now() });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
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
    const candle: Candle & { symbol: string; finalized: boolean } = {
      symbol,
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
    const data = await fetch(`${this.restUrl}/api/v3/ticker/24hr`).then(r => r.json()) as Record<string, unknown>[];

    return data
      .filter((t: Record<string, unknown>) => {
        const sym = t.symbol as string;
        if (!sym.endsWith('USDT')) return false;
        if (symbols) {
          const normalized = normalizeSymbol(sym, 'binance');
          return symbols.includes(normalized);
        }
        return true;
      })
      .map((t: Record<string, unknown>): Ticker => ({
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
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 500, endTime?: number): Promise<Candle[]> {
    const local = this.toLocalSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    let url = `${this.restUrl}/api/v3/klines?symbol=${local}&interval=${tf}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;

    const data = await fetch(url).then(r => r.json()) as unknown[];

    return data.map((k: unknown[]): Candle => ({
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
}
