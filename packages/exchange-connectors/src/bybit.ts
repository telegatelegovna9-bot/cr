// Bybit exchange connector

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W',
};

export class BybitConnector extends BaseExchangeConnector {
  constructor() {
    super({
      id: 'bybit',
      wsUrl: 'wss://stream.bybit.com/v5/public/linear',
      restUrl: 'https://api.bybit.com',
      rateLimit: 600,
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

  protected getPingMessage(): unknown {
    return { op: 'ping' };
  }

  subscribeTicker(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [`tickers.${local}`] });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const local = this.toLocalSymbol(symbol);
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [`kline.${TIMEFRAME_MAP[timeframe]}.${local}`] });
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [`orderbook.50.${local}`] });
  }

  subscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [`publicTrade.${local}`] });
  }

  unsubscribeTicker(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    this.subscriptions.delete(`ticker:${symbol}`);
    this.send({ op: 'unsubscribe', args: [`tickers.${local}`] });
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const local = this.toLocalSymbol(symbol);
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.send({ op: 'unsubscribe', args: [`kline.${TIMEFRAME_MAP[timeframe]}.${local}`] });
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({ op: 'unsubscribe', args: [`orderbook.50.${local}`] });
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toLocalSymbol(symbol);
    this.subscriptions.delete(`trades:${symbol}`);
    this.send({ op: 'unsubscribe', args: [`publicTrade.${local}`] });
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    const topic = msg.topic as string;
    if (!topic) return;

    if (topic.startsWith('tickers.')) {
      const data = msg.data as Record<string, unknown>;
      const symbol = this.fromLocalSymbol(data.symbol as string);
      const ticker: Ticker = {
        symbol,
        exchange: 'bybit',
        price: parseFloat(data.lastPrice as string),
        priceChange24h: parseFloat(data.price24hPcnt as string) * parseFloat(data.lastPrice as string),
        priceChangePercent24h: parseFloat(data.price24hPcnt as string) * 100,
        high24h: parseFloat(data.highPrice24h as string),
        low24h: parseFloat(data.lowPrice24h as string),
        volume24h: parseFloat(data.volume24h as string),
        quoteVolume24h: parseFloat(data.turnover24h as string),
        trades24h: 0,
        bid: parseFloat(data.bid1Price as string),
        ask: parseFloat(data.ask1Price as string),
        spread: parseFloat(data.ask1Price as string) - parseFloat(data.bid1Price as string),
        lastUpdate: Date.now(),
      };
      this.emit('ticker', ticker);
    } else if (topic.startsWith('kline.')) {
      const data = (msg.data as Record<string, unknown>[])[0];
      if (!data) return;
      const symbol = this.fromLocalSymbol(data.symbol as string);
      const candle: Candle & { symbol: string; finalized: boolean } = {
        symbol,
        timestamp: data.start as number,
        open: parseFloat(data.open as string),
        high: parseFloat(data.high as string),
        low: parseFloat(data.low as string),
        close: parseFloat(data.close as string),
        volume: parseFloat(data.volume as string),
        trades: 0,
        finalized: data.confirm as boolean,
      };
      this.emit('candle', candle);
    } else if (topic.startsWith('orderbook.')) {
      const data = msg.data as Record<string, unknown>;
      const symbol = this.fromLocalSymbol(data.s as string || (msg.topic as string).split('.').pop()!);
      const bids = ((data.b as [string, string][]) || []).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      const asks = ((data.a as [string, string][]) || []).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      this.emit('orderbook', { symbol, exchange: 'bybit', bids, asks, timestamp: Date.now() } as OrderBook);
    } else if (topic.startsWith('publicTrade.')) {
      const trades = (msg.data as Record<string, unknown>[]).map((t): Trade => ({
        id: String(t.i),
        symbol: this.fromLocalSymbol(t.s as string),
        exchange: 'bybit',
        price: parseFloat(t.p as string),
        quantity: parseFloat(t.v as string),
        side: (t.S as string) === 'Buy' ? 'buy' : 'sell',
        timestamp: t.T as number,
      }));
      trades.forEach(t => this.emit('trade', t));
    }
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const data = await this.fetch<{ result: { list: Record<string, unknown>[] } }>(
      '/v5/market/tickers?category=linear'
    );

    return data.result.list
      .filter((t) => {
        if (!(t.symbol as string).endsWith('USDT')) return false;
        if (symbols) {
          const normalized = normalizeSymbol(t.symbol as string, 'bybit');
          return symbols.includes(normalized);
        }
        return true;
      })
      .map((t): Ticker => ({
        symbol: normalizeSymbol(t.symbol as string, 'bybit'),
        exchange: 'bybit',
        price: parseFloat(t.lastPrice as string),
        priceChange24h: parseFloat(t.price24hPcnt as string) * parseFloat(t.lastPrice as string),
        priceChangePercent24h: parseFloat(t.price24hPcnt as string) * 100,
        high24h: parseFloat(t.highPrice24h as string),
        low24h: parseFloat(t.lowPrice24h as string),
        volume24h: parseFloat(t.volume24h as string),
        quoteVolume24h: parseFloat(t.turnover24h as string),
        trades24h: 0,
        bid: parseFloat(t.bid1Price as string),
        ask: parseFloat(t.ask1Price as string),
        spread: parseFloat(t.ask1Price as string) - parseFloat(t.bid1Price as string),
        lastUpdate: Date.now(),
      }));
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    const local = this.toLocalSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const data = await this.fetch<{ result: { list: string[][] } }>(
      `/v5/market/kline?category=linear&symbol=${local}&interval=${tf}&limit=${limit}`
    );

    return data.result.list.map((k): Candle => ({
      timestamp: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      trades: 0,
    })).reverse();
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toLocalSymbol(symbol);
    const data = await this.fetch<{ result: { b: [string, string][]; a: [string, string][] } }>(
      `/v5/market/orderbook?category=linear&symbol=${local}&limit=${limit}`
    );

    return {
      symbol,
      exchange: 'bybit',
      bids: data.result.b.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: data.result.a.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }
}
