// Bybit exchange connector — spot + linear futures

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W',
};
const REVERSE_TIMEFRAME_MAP: Record<string, Timeframe> = {
  '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', D: '1d', W: '1w',
};

const BYBIT_SPOT_WS = 'wss://stream.bybit.com/v5/public/spot';
const BYBIT_LINEAR_WS = 'wss://stream.bybit.com/v5/public/linear';
const BYBIT_REST = 'https://api.bybit.com';

export class BybitConnector extends BaseExchangeConnector {
  private spotWs: WebSocket | null = null;
  private spotConnected = false;
  private spotSubscriptions = new Set<string>();

  constructor() {
    super({
      id: 'bybit',
      wsUrl: BYBIT_LINEAR_WS,
      restUrl: BYBIT_REST,
      rateLimit: 600,
    });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return;

    // ── Linear (futures) WebSocket ─────────────────────────────
    const linearWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(linearWs);
    linearWs.on('close', () => {
      console.warn('[bybit] Linear WS closed');
    });

    // ── Spot WebSocket ─────────────────────────────────────────
    const spotWs = new WebSocket(BYBIT_SPOT_WS);
    this.spotWs = spotWs;

    spotWs.on('open', () => {
      this.spotConnected = true;
    });
    spotWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        msg.__marketType = 'spot';
        this.handleMessage(msg);
      } catch { /* ignore */ }
    });
    spotWs.on('close', () => {
      this.spotConnected = false;
      this.spotSubscriptions.clear();
    });
    spotWs.on('error', (err: Error) => {
      console.warn(`[bybit] Spot WS error: ${err.message}`);
    });

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      const done = () => { clearTimeout(timer); resolve(); };
      linearWs.once('open', done);
      linearWs.once('error', done);
      linearWs.once('close', done);
    });
  }

  protected getPingMessage(): unknown {
    return { op: 'ping' };
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT') || symbol.includes(':USD');
  }

  private toBybitSymbol(symbol: string): string {
    if (this.isFuturesSymbol(symbol)) {
      return `${symbol.split('/')[0]}USDT`;
    }
    return this.toLocalSymbol(symbol);
  }

  private toFuturesSymbol(raw: string): string {
    const base = raw.toUpperCase().replace(/USDT$/, '');
    return `${base}/USDT:USDT`;
  }

  private sendSpot(data: unknown): void {
    if (this.spotWs && this.spotConnected) {
      this.spotWs.send(JSON.stringify(data));
    }
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBybitSymbol(symbol);
      const key = `ticker:${symbol}`;
      if (this.subscriptions.has(key)) return;
      this.subscriptions.add(key);
      this.send({ op: 'subscribe', args: [`tickers.${local}`] });
      return;
    }

    const local = this.toLocalSymbol(symbol);
    const key = `ticker:${symbol}`;
    if (this.spotSubscriptions.has(key)) return;
    this.spotSubscriptions.add(key);
    this.sendSpot({ op: 'subscribe', args: [`tickers.${local}`] });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const tf = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBybitSymbol(symbol);
      const key = `candle:${symbol}:${timeframe}`;
      if (this.subscriptions.has(key)) return;
      this.subscriptions.add(key);
      this.send({ op: 'subscribe', args: [`kline.${tf}.${local}`] });
      return;
    }

    const local = this.toLocalSymbol(symbol);
    const key = `candle:${symbol}:${timeframe}`;
    if (this.spotSubscriptions.has(key)) return;
    this.spotSubscriptions.add(key);
    this.sendSpot({ op: 'subscribe', args: [`kline.${tf}.${local}`] });
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
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBybitSymbol(symbol);
      this.subscriptions.delete(`ticker:${symbol}`);
      this.send({ op: 'unsubscribe', args: [`tickers.${local}`] });
      return;
    }
    const local = this.toLocalSymbol(symbol);
    this.spotSubscriptions.delete(`ticker:${symbol}`);
    this.sendSpot({ op: 'unsubscribe', args: [`tickers.${local}`] });
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const tf = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBybitSymbol(symbol);
      this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
      this.send({ op: 'unsubscribe', args: [`kline.${tf}.${local}`] });
      return;
    }
    const local = this.toLocalSymbol(symbol);
    this.spotSubscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.sendSpot({ op: 'unsubscribe', args: [`kline.${tf}.${local}`] });
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

    const isSpot = msg.__marketType === 'spot';

    if (topic.startsWith('tickers.')) {
      const data = msg.data as Record<string, unknown>;
      if (!data) return;
      const rawSymbol = data.symbol as string;
      const symbol = isSpot
        ? this.fromLocalSymbol(rawSymbol)
        : this.toFuturesSymbol(rawSymbol);
      const ticker: Ticker = {
        exchange: 'bybit',
        marketType: isSpot ? 'spot' : 'futures',
        symbol,
        lastPrice: parseFloat(data.lastPrice as string),
        priceChange24h: parseFloat(data.price24hPcnt as string) * parseFloat(data.lastPrice as string),
        volume24h: parseFloat(data.volume24h as string),
        high24h: parseFloat(data.highPrice24h as string),
        low24h: parseFloat(data.lowPrice24h as string),
        timestamp: Date.now(),
        // Optional
        priceChangePercent24h: parseFloat(data.price24hPcnt as string) * 100,
        quoteVolume24h: parseFloat(data.turnover24h as string),
        bid: parseFloat(data.bid1Price as string),
        ask: parseFloat(data.ask1Price as string),
        spread: parseFloat(data.ask1Price as string) - parseFloat(data.bid1Price as string),
      };
      this.emit('ticker', ticker);
    } else if (topic.startsWith('kline.')) {
      const data = (msg.data as Record<string, unknown>[])[0];
      if (!data) return;
      const [, interval] = topic.split('.');
      const rawSymbol = data.symbol as string;
      const symbol = isSpot
        ? this.fromLocalSymbol(rawSymbol)
        : this.toFuturesSymbol(rawSymbol);
      const candle: Candle = {
        exchange: 'bybit',
        marketType: isSpot ? 'spot' : 'futures',
        symbol,
        timeframe: REVERSE_TIMEFRAME_MAP[interval] || '1m',
        time: data.start as number,
        open: parseFloat(data.open as string),
        high: parseFloat(data.high as string),
        low: parseFloat(data.low as string),
        close: parseFloat(data.close as string),
        volume: parseFloat(data.volume as string),
        isClosed: data.confirm as boolean,
        trades: 0,
      };
      this.emit('candle', candle);
    } else if (topic.startsWith('orderbook.')) {
      const data = msg.data as Record<string, unknown>;
      const rawSymbol = data.s as string || (msg.topic as string).split('.').pop()!;
      const symbol = this.fromLocalSymbol(rawSymbol);
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
    const [linearRes, spotRes] = await Promise.allSettled([
      this.fetch<{ result: { list: Record<string, unknown>[] } }>('/v5/market/tickers?category=linear'),
      this.fetch<{ result: { list: Record<string, unknown>[] } }>('/v5/market/tickers?category=spot'),
    ]);

    const results: Ticker[] = [];

    if (linearRes.status === 'fulfilled') {
      const futures = linearRes.value.result.list
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          exchange: 'bybit',
          marketType: 'futures',
          symbol: this.toFuturesSymbol(t.symbol as string),
          lastPrice: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.price24hPcnt as string) * parseFloat(t.lastPrice as string),
          volume24h: parseFloat(t.volume24h as string),
          high24h: parseFloat(t.highPrice24h as string),
          low24h: parseFloat(t.lowPrice24h as string),
          timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.price24hPcnt as string) * 100,
          quoteVolume24h: parseFloat(t.turnover24h as string),
          bid: parseFloat(t.bid1Price as string),
          ask: parseFloat(t.ask1Price as string),
          spread: parseFloat(t.ask1Price as string) - parseFloat(t.bid1Price as string),
        }));
      results.push(...futures);
    }

    if (spotRes.status === 'fulfilled') {
      const spot = spotRes.value.result.list
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          exchange: 'bybit',
          marketType: 'spot',
          symbol: normalizeSymbol(t.symbol as string, 'bybit'),
          lastPrice: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.price24hPcnt as string) * parseFloat(t.lastPrice as string),
          volume24h: parseFloat(t.volume24h as string),
          high24h: parseFloat(t.highPrice24h as string),
          low24h: parseFloat(t.lowPrice24h as string),
          timestamp: Date.now(),
          priceChangePercent24h: parseFloat(t.price24hPcnt as string) * 100,
          quoteVolume24h: parseFloat(t.turnover24h as string),
          bid: parseFloat(t.bid1Price as string),
          ask: parseFloat(t.ask1Price as string),
          spread: parseFloat(t.ask1Price as string) - parseFloat(t.bid1Price as string),
        }));
      results.push(...spot);
    }

    if (symbols) return results.filter(t => symbols.includes(t.symbol));
    return results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 200, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    const local = this.toBybitSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const category = isFutures ? 'linear' : 'spot';
    let url = `/v5/market/kline?category=${category}&symbol=${local}&interval=${tf}&limit=${limit}`;
    if (endTime) url += `&end=${endTime}`;

    const data = await this.fetch<{ result: { list: string[][] } }>(url);
    return data.result.list.map((k): Candle => ({
      exchange: 'bybit',
      marketType: isFutures ? 'futures' : 'spot',
      symbol,
      timeframe,
      time: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      isClosed: true,
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

  disconnect(): void {
    super.disconnect();
    if (this.spotWs) {
      this.spotWs.removeAllListeners();
      this.spotWs.close();
      this.spotWs = null;
    }
    this.spotConnected = false;
    this.spotSubscriptions.clear();
  }
}