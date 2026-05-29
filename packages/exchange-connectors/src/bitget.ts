// Bitget exchange connector — spot + futures (mix) WebSocket

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};

const BITGET_SPOT_WS = 'wss://ws.bitget.com/v2/ws/public';
const BITGET_FUTURES_WS = 'wss://ws.bitget.com/v2/ws/public';
const BITGET_REST = 'https://api.bitget.com';

export class BitgetConnector extends BaseExchangeConnector {
  // Bitget uses a single WS endpoint for both spot and futures (differentiated by instType)
  // We use the base ws for spot, and a second connection for futures
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();

  constructor() {
    super({
      id: 'bitget',
      wsUrl: BITGET_SPOT_WS,
      restUrl: BITGET_REST,
      rateLimit: 600,
    });
  }

  async connectWS(): Promise<void> {
    if (this.connected || this.ws) return;

    // ── Spot WebSocket ─────────────────────────────────────────
    const spotWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(spotWs);
    spotWs.on('close', () => {
      console.warn('[bitget] Spot WS closed');
    });

    // ── Futures WebSocket ──────────────────────────────────────
    const futuresWs = new WebSocket(BITGET_FUTURES_WS);
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
      console.warn(`[bitget] Futures WS error: ${err.message}`);
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
    return 'ping';
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT') || symbol.includes(':USD');
  }

  private toBitgetSpotSymbol(symbol: string): string {
    // BTC/USDT -> BTCUSDT
    return symbol.replace('/', '');
  }

  private toBitgetFuturesSymbol(symbol: string): string {
    // BTC/USDT:USDT -> BTCUSDT
    return `${symbol.split('/')[0]}USDT`;
  }

  private fromBitgetFuturesSymbol(raw: string): string {
    const base = raw.replace(/USDT$/, '');
    return `${base}/USDT:USDT`;
  }

  private sendFutures(data: unknown): void {
    if (this.futuresWs && this.futuresConnected) {
      this.futuresWs.send(JSON.stringify(data));
    }
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const key = `ticker:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.sendFutures({
        op: 'subscribe',
        args: [{ instType: 'USDT-FUTURES', channel: 'ticker', instId: local }],
      });
      return;
    }

    const local = this.toBitgetSpotSymbol(symbol);
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: 'ticker', instId: local }],
    });
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const tf = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const key = `candle:${symbol}:${timeframe}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      this.sendFutures({
        op: 'subscribe',
        args: [{ instType: 'USDT-FUTURES', channel: `candle${tf}`, instId: local }],
      });
      return;
    }

    const local = this.toBitgetSpotSymbol(symbol);
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: `candle${tf}`, instId: local }],
    });
  }

  subscribeOrderBook(symbol: string): void {
    const local = this.toBitgetSpotSymbol(symbol);
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: 'books15', instId: local }],
    });
  }

  subscribeTrades(symbol: string): void {
    const local = this.toBitgetSpotSymbol(symbol);
    const key = `trades:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.send({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: 'trade', instId: local }],
    });
  }

  unsubscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`ticker:${symbol}`);
      this.sendFutures({
        op: 'unsubscribe',
        args: [{ instType: 'USDT-FUTURES', channel: 'ticker', instId: local }],
      });
      return;
    }
    const local = this.toBitgetSpotSymbol(symbol);
    this.subscriptions.delete(`ticker:${symbol}`);
    this.send({
      op: 'unsubscribe',
      args: [{ instType: 'SPOT', channel: 'ticker', instId: local }],
    });
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const tf = TIMEFRAME_MAP[timeframe];
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`candle:${symbol}:${timeframe}`);
      this.sendFutures({
        op: 'unsubscribe',
        args: [{ instType: 'USDT-FUTURES', channel: `candle${tf}`, instId: local }],
      });
      return;
    }
    const local = this.toBitgetSpotSymbol(symbol);
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    this.send({
      op: 'unsubscribe',
      args: [{ instType: 'SPOT', channel: `candle${tf}`, instId: local }],
    });
  }

  unsubscribeOrderBook(symbol: string): void {
    const local = this.toBitgetSpotSymbol(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({
      op: 'unsubscribe',
      args: [{ instType: 'SPOT', channel: 'books15', instId: local }],
    });
  }

  unsubscribeTrades(symbol: string): void {
    const local = this.toBitgetSpotSymbol(symbol);
    this.subscriptions.delete(`trades:${symbol}`);
    this.send({
      op: 'unsubscribe',
      args: [{ instType: 'SPOT', channel: 'trade', instId: local }],
    });
  }

  protected handleMessage(msg: Record<string, unknown>): void {
    if (msg.event === 'subscribe' || msg.event === 'unsubscribe' || msg.event === 'error') return;
    if (msg.op === 'pong') return;

    const isFutures = msg.__marketType === 'futures';
    const arg = msg.arg as Record<string, unknown>;
    const data = msg.data as Record<string, unknown>[];
    if (!arg || !data?.length) return;

    const channel = arg.channel as string;
    const instId = arg.instId as string;

    if (channel === 'ticker') {
      const d = data[0];
      const symbol = isFutures
        ? this.fromBitgetFuturesSymbol(instId)
        : normalizeSymbol(instId, 'bitget');
      const price = parseFloat(d.lastPr as string);
      const open = parseFloat(d.open24h as string);
      const ticker: Ticker = {
        symbol,
        exchange: 'bitget',
        marketType: isFutures ? 'futures' : 'spot',
        price,
        priceChange24h: price - open,
        priceChangePercent24h: ((price - open) / open) * 100,
        high24h: parseFloat(d.high24h as string),
        low24h: parseFloat(d.low24h as string),
        volume24h: parseFloat(d.baseVolume as string),
        quoteVolume24h: parseFloat(d.quoteVolume as string),
        trades24h: 0,
        bid: parseFloat(d.bestBid as string),
        ask: parseFloat(d.bestAsk as string),
        spread: parseFloat(d.bestAsk as string) - parseFloat(d.bestBid as string),
        lastUpdate: Date.now(),
      };
      this.emit('ticker', ticker);
    } else if (channel.startsWith('candle')) {
      const symbol = isFutures
        ? this.fromBitgetFuturesSymbol(instId)
        : normalizeSymbol(instId, 'bitget');
      // Extract timeframe from channel name e.g. "candle1m" -> "1m"
      const tfRaw = channel.replace('candle', '');
      const timeframe = this.reverseTimeframe(tfRaw);
      data.forEach((k: Record<string, unknown>) => {
        const candle: Candle & { symbol: string; exchange: 'bitget'; timeframe: string; finalized: boolean; marketType: 'spot' | 'futures' } = {
          symbol,
          exchange: 'bitget',
          marketType: isFutures ? 'futures' : 'spot',
          timeframe,
          timestamp: parseInt(k[0] as string, 10),
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
          volume: parseFloat(k[5] as string),
          trades: 0,
          finalized: (k[6] as string) === '1',
        };
        this.emit('candle', candle);
      });
    } else if (channel === 'books15') {
      const d = data[0];
      const symbol = normalizeSymbol(instId, 'bitget');
      const bids = ((d.bids || d.b) as [string, string][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      const asks = ((d.asks || d.a) as [string, string][]).map(([p, q]) => ({
        price: parseFloat(p), quantity: parseFloat(q),
      }));
      this.emit('orderbook', { symbol, exchange: 'bitget', bids, asks, timestamp: Date.now() } as OrderBook);
    } else if (channel === 'trade') {
      const symbol = normalizeSymbol(instId, 'bitget');
      data.forEach((t: Record<string, unknown>) => {
        const trade: Trade = {
          id: String(t.tradeId || Date.now()),
          symbol,
          exchange: 'bitget',
          price: parseFloat(t.price as string),
          quantity: parseFloat(t.size as string),
          side: (t.side as string) === 'buy' ? 'buy' : 'sell',
          timestamp: parseInt(t.ts as string, 10),
        };
        this.emit('trade', trade);
      });
    }
  }

  private reverseTimeframe(tf: string): string {
    const map: Record<string, string> = {
      '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w',
    };
    return map[tf] || tf;
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchRaw<{ data: Record<string, unknown>[] }>(`${BITGET_REST}/api/v2/spot/market/tickers`),
      this.fetchRaw<{ data: Record<string, unknown>[] }>(`${BITGET_REST}/api/v2/mix/market/tickers?productType=USDT-FUTURES`),
    ]);

    const results: Ticker[] = [];

    if (spotRes.status === 'fulfilled') {
      const spot = (spotRes.value.data || [])
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => ({
          symbol: normalizeSymbol(t.symbol as string, 'bitget'),
          exchange: 'bitget',
          marketType: 'spot',
          price: parseFloat(t.lastPr as string),
          priceChange24h: parseFloat(t.change24h as string),
          priceChangePercent24h: parseFloat(t.changeUtc24h as string) * 100,
          high24h: parseFloat(t.high24h as string),
          low24h: parseFloat(t.low24h as string),
          volume24h: parseFloat(t.baseVolume as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: 0,
          bid: parseFloat(t.bestBid as string),
          ask: parseFloat(t.bestAsk as string),
          spread: parseFloat(t.bestAsk as string) - parseFloat(t.bestBid as string),
          lastUpdate: Date.now(),
        }));
      results.push(...spot);
    }

    if (futuresRes.status === 'fulfilled') {
      const futures = (futuresRes.value.data || [])
        .filter(t => (t.symbol as string).endsWith('USDT'))
        .map((t): Ticker => {
          const price = parseFloat(t.lastPr as string);
          const open = parseFloat(t.open24h as string);
          return {
            symbol: this.fromBitgetFuturesSymbol(t.symbol as string),
            exchange: 'bitget',
            marketType: 'futures',
            price,
            priceChange24h: price - open,
            priceChangePercent24h: ((price - open) / open) * 100,
            high24h: parseFloat(t.high24h as string),
            low24h: parseFloat(t.low24h as string),
            volume24h: parseFloat(t.baseVolume as string),
            quoteVolume24h: parseFloat(t.quoteVolume as string),
            trades24h: 0,
            bid: price,
            ask: price,
            spread: 0,
            lastUpdate: Date.now(),
          };
        });
      results.push(...futures);
    }

    if (symbols) return results.filter(t => symbols.includes(t.symbol));
    return results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 200, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];

    if (isFutures) {
      const local = this.toBitgetFuturesSymbol(symbol);
      let url = `${BITGET_REST}/api/v2/mix/market/candles?symbol=${local}&granularity=${tf}&limit=${limit}&productType=USDT-FUTURES`;
      if (endTime) url += `&endTime=${endTime}`;
      const data = await this.fetchRaw<{ data: string[][] }>(url);
      return (data.data || []).map((k): Candle => ({
        timestamp: parseInt(k[0], 10),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        trades: 0,
        marketType: 'futures',
      }));
    }

    const local = this.toBitgetSpotSymbol(symbol);
    let url = `${BITGET_REST}/api/v2/spot/market/candles?symbol=${local}&granularity=${tf}&limit=${limit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchRaw<{ data: string[][] }>(url);
    return (data.data || []).map((k): Candle => ({
      timestamp: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      trades: 0,
      marketType: 'spot',
    }));
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toBitgetSpotSymbol(symbol);
    const data = await this.fetchRaw<{ data: { bids: [string, string][]; asks: [string, string][] } }>(
      `${BITGET_REST}/api/v2/spot/market/orderbook?symbol=${local}&limit=${limit}`
    );
    return {
      symbol,
      exchange: 'bitget',
      bids: (data.data?.bids || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: (data.data?.asks || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }

  private async fetchRaw<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`[bitget] HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
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
