// OKX exchange connector — spot + swap (perpetual futures)

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};
const REVERSE_TIMEFRAME_MAP: Record<string, Timeframe> = {
  candle1m: '1m',
  candle5m: '5m',
  candle15m: '15m',
  candle1H: '1h',
  candle4H: '4h',
  candle1D: '1d',
  candle1W: '1w',
};

const OKX_WS_PUBLIC = 'wss://ws.okx.com:8443/ws/v5/public';
const OKX_REST = 'https://www.okx.com';

export class OKXConnector extends BaseExchangeConnector {
  constructor() {
    super({
      id: 'okx',
      wsUrl: OKX_WS_PUBLIC,
      restUrl: OKX_REST,
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
    return 'ping';
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT') || symbol.includes(':USD');
  }

  private toOKXInstId(symbol: string): string {
    if (this.isFuturesSymbol(symbol)) {
      const base = symbol.split('/')[0];
      return `${base}-USDT-SWAP`;
    }
    return this.toLocalSymbol(symbol);
  }

  private fromOKXInstId(instId: string): string {
    if (instId.endsWith('-SWAP')) {
      const parts = instId.split('-');
      return `${parts[0]}/${parts[1]}:${parts[1]}`;
    }
    return normalizeSymbol(instId, 'okx');
  }

  subscribeTicker(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [{ channel: 'tickers', instId }] });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const instId = this.toOKXInstId(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [{ channel: `candle${tf}`, instId }] });
  }

  subscribeOrderBook(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [{ channel: 'books5', instId }] });
  }

  subscribeTrades(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({ op: 'subscribe', args: [{ channel: 'trades', instId }] });
  }

  unsubscribeTicker(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    this.subscriptions.delete(`ticker:${symbol}`);
    this.send({ op: 'unsubscribe', args: [{ channel: 'tickers', instId }] });
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const instId = this.toOKXInstId(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.send({ op: 'unsubscribe', args: [{ channel: `candle${tf}`, instId }] });
  }

  unsubscribeOrderBook(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({ op: 'unsubscribe', args: [{ channel: 'books5', instId }] });
  }

  unsubscribeTrades(symbol: string): void {
    const instId = this.toOKXInstId(symbol);
    this.subscriptions.delete(`trades:${symbol}`);
    this.send({ op: 'unsubscribe', args: [{ channel: 'trades', instId }] });
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    if (msg.event === 'subscribe' || msg.event === 'unsubscribe') return;

    const arg = msg.arg as Record<string, unknown>;
    if (!arg) return;
    const channel = arg.channel as string;
    const instId = arg.instId as string;
    const data = msg.data as Record<string, unknown>[];
    if (!data || !data.length) return;

    const isFutures = instId?.endsWith('-SWAP') || false;
    const symbol = this.fromOKXInstId(instId || '');

    if (channel === 'tickers') {
      const d = data[0];
      const ticker: Ticker = {
        symbol,
        exchange: 'okx',
        marketType: isFutures ? 'futures' : 'spot',
        price: parseFloat(d.last as string),
        priceChange24h: parseFloat(d.last as string) - parseFloat(d.open24h as string),
        priceChangePercent24h: ((parseFloat(d.last as string) - parseFloat(d.open24h as string)) / parseFloat(d.open24h as string)) * 100,
        high24h: parseFloat(d.high24h as string),
        low24h: parseFloat(d.low24h as string),
        volume24h: parseFloat(d.vol24h as string),
        quoteVolume24h: parseFloat(d.volCcy24h as string),
        trades24h: 0,
        bid: parseFloat(d.bidPx as string),
        ask: parseFloat(d.askPx as string),
        spread: parseFloat(d.askPx as string) - parseFloat(d.bidPx as string),
        lastUpdate: Date.now(),
      };
      this.emit('ticker', ticker);
    } else if (channel.startsWith('candle')) {
      const d = data[0];
      const candle: Candle & { symbol: string; exchange: 'okx'; timeframe: Timeframe; finalized: boolean; marketType: 'spot' | 'futures' } = {
        symbol,
        exchange: 'okx',
        marketType: isFutures ? 'futures' : 'spot',
        timeframe: REVERSE_TIMEFRAME_MAP[channel] || '1m',
        timestamp: parseInt(d.ts as string, 10),
        open: parseFloat(d.o as string),
        high: parseFloat(d.h as string),
        low: parseFloat(d.l as string),
        close: parseFloat(d.c as string),
        volume: parseFloat(d.vol as string),
        trades: 0,
        finalized: true,
      };
      this.emit('candle', candle);
    } else if (channel === 'books5') {
      const d = data[0];
      const bids = ((d.bids || d.b) as string[][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      const asks = ((d.asks || d.a) as string[][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      this.emit('orderbook', { symbol, exchange: 'okx', bids, asks, timestamp: Date.now() } as OrderBook);
    } else if (channel === 'trades') {
      data.forEach((t: Record<string, unknown>) => {
        const trade: Trade = {
          id: String(t.tradeId),
          symbol,
          exchange: 'okx',
          price: parseFloat(t.px as string),
          quantity: parseFloat(t.sz as string),
          side: (t.side as string) === 'buy' ? 'buy' : 'sell',
          timestamp: parseInt(t.ts as string, 10),
        };
        this.emit('trade', trade);
      });
    }
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, swapRes] = await Promise.allSettled([
      this.fetch<{ data: Record<string, unknown>[] }>('/api/v5/market/tickers?instType=SPOT'),
      this.fetch<{ data: Record<string, unknown>[] }>('/api/v5/market/tickers?instType=SWAP'),
    ]);

    const results: Ticker[] = [];

    if (spotRes.status === 'fulfilled') {
      const spot = spotRes.value.data
        .filter(t => (t.instId as string).endsWith('-USDT'))
        .map((t): Ticker => ({
          symbol: normalizeSymbol(t.instId as string, 'okx'),
          exchange: 'okx',
          marketType: 'spot',
          price: parseFloat(t.last as string),
          priceChange24h: parseFloat(t.last as string) - parseFloat(t.open24h as string),
          priceChangePercent24h: ((parseFloat(t.last as string) - parseFloat(t.open24h as string)) / parseFloat(t.open24h as string)) * 100,
          high24h: parseFloat(t.high24h as string),
          low24h: parseFloat(t.low24h as string),
          volume24h: parseFloat(t.vol24h as string),
          quoteVolume24h: parseFloat(t.volCcy24h as string),
          trades24h: 0,
          bid: parseFloat(t.bidPx as string),
          ask: parseFloat(t.askPx as string),
          spread: parseFloat(t.askPx as string) - parseFloat(t.bidPx as string),
          lastUpdate: Date.now(),
        }));
      results.push(...spot);
    }

    if (swapRes.status === 'fulfilled') {
      const futures = swapRes.value.data
        .filter(t => (t.instId as string).endsWith('-USDT-SWAP'))
        .map((t): Ticker => ({
          symbol: this.fromOKXInstId(t.instId as string),
          exchange: 'okx',
          marketType: 'futures',
          price: parseFloat(t.last as string),
          priceChange24h: parseFloat(t.last as string) - parseFloat(t.open24h as string),
          priceChangePercent24h: ((parseFloat(t.last as string) - parseFloat(t.open24h as string)) / parseFloat(t.open24h as string)) * 100,
          high24h: parseFloat(t.high24h as string),
          low24h: parseFloat(t.low24h as string),
          volume24h: parseFloat(t.vol24h as string),
          quoteVolume24h: parseFloat(t.volCcy24h as string),
          trades24h: 0,
          bid: parseFloat(t.bidPx as string),
          ask: parseFloat(t.askPx as string),
          spread: parseFloat(t.askPx as string) - parseFloat(t.bidPx as string),
          lastUpdate: Date.now(),
        }));
      results.push(...futures);
    }

    if (symbols) return results.filter(t => symbols.includes(t.symbol));
    return results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 300, endTime?: number): Promise<Candle[]> {
    const instId = this.toOKXInstId(symbol);
    const isFutures = this.isFuturesSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    let url = `/api/v5/market/candles?instId=${instId}&bar=${tf}&limit=${limit}`;
    if (endTime) url += `&after=${endTime}`;

    const data = await this.fetch<{ data: string[][] }>(url);
    return data.data.map((k): Candle => ({
      timestamp: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      trades: 0,
      marketType: isFutures ? 'futures' : 'spot',
    }));
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const instId = this.toOKXInstId(symbol);
    const sz = limit <= 5 ? '5' : limit <= 400 ? String(limit) : '400';
    const data = await this.fetch<{ data: [{ bids: string[][]; asks: string[][] }] }>(
      `/api/v5/market/books?instId=${instId}&sz=${sz}`
    );

    const book = data.data[0];
    return {
      symbol,
      exchange: 'okx',
      bids: book.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: book.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }
}
