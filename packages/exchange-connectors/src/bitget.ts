// Bitget exchange connector — spot + futures (mix) WebSocket

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, WS_RECONNECT_DELAY } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};

const TIMEFRAME_MAP_SPOT: Record<Timeframe, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week',
};

const BITGET_SPOT_WS = 'wss://ws.bitget.com/v2/ws/public';
const BITGET_FUTURES_WS = 'wss://ws.bitget.com/v2/ws/public';
const BITGET_REST = 'https://api.bitget.com';

export class BitgetConnector extends BaseExchangeConnector {
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();
  private activeFuturesSubs = new Set<string>();
  private futuresHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private spotHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private futuresReconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

    const spotWs = new WebSocket(this.wsUrl);
    this.setupWebSocket(spotWs);
    spotWs.on('close', () => {
      console.warn('[bitget] Spot WS closed');
      this.stopSpotHeartbeat();
    });
    spotWs.on('open', () => {
      this.startSpotHeartbeat();
    });

    const futuresWs = new WebSocket(BITGET_FUTURES_WS);
    this.setupFuturesWebSocket(futuresWs);

    await Promise.allSettled([
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        const done = () => { clearTimeout(timer); resolve(); };
        spotWs.once('open', done);
        spotWs.once('error', done);
        spotWs.once('close', done);
      }),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        const done = () => { clearTimeout(timer); resolve(); };
        futuresWs.once('open', done);
        futuresWs.once('error', done);
        futuresWs.once('close', done);
      }),
    ]);
  }

  private setupFuturesWebSocket(futuresWs: WebSocket): void {
    this.futuresWs = futuresWs;

    futuresWs.on('open', () => {
      this.futuresConnected = true;
      this.startFuturesHeartbeat();
      for (const sub of this.activeFuturesSubs) {
        this.sendFuturesSubscription('subscribe', sub);
      }
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
      this.futuresWs = null;
      this.futuresSubscriptions.clear();
      this.stopFuturesHeartbeat();
      if (!this.futuresReconnectTimer) {
        this.futuresReconnectTimer = setTimeout(() => {
          this.futuresReconnectTimer = null;
          this.reconnectFuturesWS();
        }, WS_RECONNECT_DELAY);
      }
    });

    futuresWs.on('error', (err: Error) => {
      console.warn(`[bitget] Futures WS error: ${err.message}`);
    });
  }

  private reconnectFuturesWS(): void {
    if (this.futuresWs) return;
    this.setupFuturesWebSocket(new WebSocket(BITGET_FUTURES_WS));
  }

  private startSpotHeartbeat(): void {
    this.stopSpotHeartbeat();
    this.spotHeartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send('ping');
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
      if (this.futuresWs && this.futuresConnected) {
        this.futuresWs.send('ping');
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
    return 'ping';
  }

  private isFuturesSymbol(symbol: string): boolean {
    return symbol.includes(':USDT') || symbol.includes(':USD');
  }

  private toBitgetSpotSymbol(symbol: string): string {
    return symbol.replace('/', '');
  }

  private toBitgetFuturesSymbol(symbol: string): string {
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

  private sendFuturesSubscription(op: 'subscribe' | 'unsubscribe', stream: string): void {
    const [channel, instId] = stream.split('|');
    if (!channel || !instId) return;
    this.sendFutures({
      op,
      args: [{ instType: 'USDT-FUTURES', channel, instId }],
    });
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const key = `ticker:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `ticker|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
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
      const stream = `candle${tf}|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
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
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const key = `orderbook:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `books15|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
      return;
    }
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
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const key = `trades:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `trade|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
      return;
    }
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
      const stream = `ticker|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
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
      const stream = `candle${tf}|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
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
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`orderbook:${symbol}`);
      const stream = `books15|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
      return;
    }
    const local = this.toBitgetSpotSymbol(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    this.send({
      op: 'unsubscribe',
      args: [{ instType: 'SPOT', channel: 'books15', instId: local }],
    });
  }

  unsubscribeTrades(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toBitgetFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`trades:${symbol}`);
      const stream = `trade|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
      return;
    }
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
      const symbol = isFutures ? this.fromBitgetFuturesSymbol(instId) : normalizeSymbol(instId, 'bitget');
      const price = parseFloat(d.lastPr as string);
      const open = parseFloat(d.open24h as string);
      const bid = parseFloat((d.bidPr as string) || (d.bestBid as string));
      const ask = parseFloat((d.askPr as string) || (d.bestAsk as string));
      this.emit('ticker', {
        exchange: 'bitget',
        marketType: isFutures ? 'futures' : 'spot',
        symbol,
        lastPrice: price,
        priceChange24h: price - open,
        volume24h: parseFloat(d.baseVolume as string),
        high24h: parseFloat(d.high24h as string),
        low24h: parseFloat(d.low24h as string),
        timestamp: Date.now(),
        priceChangePercent24h: ((price - open) / open) * 100,
        quoteVolume24h: parseFloat(d.quoteVolume as string),
        trades24h: 0,
        bid: Number.isFinite(bid) ? bid : price,
        ask: Number.isFinite(ask) ? ask : price,
        spread: Number.isFinite(bid) && Number.isFinite(ask) ? ask - bid : 0,
      } as Ticker);
    } else if (channel.startsWith('candle')) {
      const symbol = isFutures ? this.fromBitgetFuturesSymbol(instId) : normalizeSymbol(instId, 'bitget');
      const tfRaw = channel.replace('candle', '');
      const timeframe = this.reverseTimeframe(tfRaw);
      // Bitget sends a large historical snapshot on initial subscribe.
      // History is already fetched via REST, so pushing the whole snapshot
      // through the real-time pipeline creates UI stalls for no benefit.
      const latest = data[data.length - 1];
      if (!Array.isArray(latest) || latest.length < 6) return;
      this.emit('candle', {
        exchange: 'bitget',
        marketType: isFutures ? 'futures' : 'spot',
        symbol,
        timeframe,
        time: parseInt(latest[0] as string, 10),
        open: parseFloat(latest[1] as string),
        high: parseFloat(latest[2] as string),
        low: parseFloat(latest[3] as string),
        close: parseFloat(latest[4] as string),
        volume: parseFloat(latest[5] as string),
        isClosed: false,
        trades: 0,
      } as Candle);
    } else if (channel === 'books15') {
      const symbol = isFutures ? this.fromBitgetFuturesSymbol(instId) : normalizeSymbol(instId, 'bitget');
      const bids = ((data[0].bids || data[0].b) as [string, string][]).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }));
      const asks = ((data[0].asks || data[0].a) as [string, string][]).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }));
      this.emit('orderbook', {
        symbol,
        exchange: 'bitget',
        marketType: isFutures ? 'futures' : 'spot',
        bids,
        asks,
        timestamp: Date.now(),
      } as OrderBook);
    } else if (channel === 'trade') {
      const symbol = isFutures ? this.fromBitgetFuturesSymbol(instId) : normalizeSymbol(instId, 'bitget');
      data.forEach((t: Record<string, unknown>) => {
        this.emit('trade', {
          id: String(t.tradeId || Date.now()),
          symbol,
          exchange: 'bitget',
          marketType: isFutures ? 'futures' : 'spot',
          price: parseFloat(t.price as string),
          quantity: parseFloat(t.size as string),
          side: (t.side as string) === 'buy' ? 'buy' : 'sell',
          timestamp: parseInt(t.ts as string, 10),
        } as Trade);
      });
    }
  }

  private reverseTimeframe(tf: string): string {
    const map: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w' };
    return map[tf] || tf;
  }

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.fetchRaw<{ data: Record<string, unknown>[] }>(`${BITGET_REST}/api/v2/spot/market/tickers`),
      this.fetchRaw<{ data: Record<string, unknown>[] }>(`${BITGET_REST}/api/v2/mix/market/tickers?productType=USDT-FUTURES`),
    ]);
    const results: Ticker[] = [];
    if (spotRes.status === 'fulfilled') {
      results.push(...(spotRes.value.data || []).filter(t => (t.symbol as string).endsWith('USDT')).map((t): Ticker => ({
        exchange: 'bitget', marketType: 'spot', symbol: normalizeSymbol(t.symbol as string, 'bitget'),
        lastPrice: parseFloat(t.lastPr as string), priceChange24h: parseFloat(t.change24h as string),
        volume24h: parseFloat(t.baseVolume as string), high24h: parseFloat(t.high24h as string), low24h: parseFloat(t.low24h as string),
        timestamp: Date.now(), priceChangePercent24h: parseFloat(t.changeUtc24h as string) * 100,
        quoteVolume24h: parseFloat(t.quoteVolume as string), trades24h: 0,
        bid: parseFloat(t.bestBid as string), ask: parseFloat(t.bestAsk as string), spread: parseFloat(t.bestAsk as string) - parseFloat(t.bestBid as string),
      })));
    }
    if (futuresRes.status === 'fulfilled') {
      results.push(...(futuresRes.value.data || []).filter(t => (t.symbol as string).endsWith('USDT')).map((t): Ticker => {
        const price = parseFloat(t.lastPr as string);
        const open = parseFloat(t.open24h as string);
        return {
          exchange: 'bitget', marketType: 'futures', symbol: this.fromBitgetFuturesSymbol(t.symbol as string),
          lastPrice: price, priceChange24h: price - open, volume24h: parseFloat(t.baseVolume as string),
          high24h: parseFloat(t.high24h as string), low24h: parseFloat(t.low24h as string), timestamp: Date.now(),
          priceChangePercent24h: ((price - open) / open) * 100, quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: 0, bid: price, ask: price, spread: 0,
        };
      }));
    }
    return symbols ? results.filter(t => symbols.includes(t.symbol)) : results;
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 200, endTime?: number): Promise<Candle[]> {
    const isFutures = this.isFuturesSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    if (isFutures) {
      const local = this.toBitgetFuturesSymbol(symbol);
      const requestLimit = endTime ? Math.min(limit, 200) : limit;
      let url = endTime
        ? `${BITGET_REST}/api/v2/mix/market/history-candles?symbol=${local}&granularity=${tf}&limit=${requestLimit}&productType=USDT-FUTURES`
        : `${BITGET_REST}/api/v2/mix/market/candles?symbol=${local}&granularity=${tf}&limit=${requestLimit}&productType=USDT-FUTURES`;
      if (endTime) url += `&endTime=${endTime}`;
      const data = await this.fetchRaw<{ data: string[][] }>(url);
      return (data.data || []).map((k): Candle => ({
        exchange: 'bitget', marketType: 'futures', symbol, timeframe, time: parseInt(k[0], 10),
        open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]), isClosed: true, trades: 0,
      })).sort((a, b) => a.time - b.time);
    }
    const local = this.toBitgetSpotSymbol(symbol);
    const tfSpot = TIMEFRAME_MAP_SPOT[timeframe];
    const requestLimit = endTime ? Math.min(limit, 200) : limit;
    let url = endTime
      ? `${BITGET_REST}/api/v2/spot/market/history-candles?symbol=${local}&granularity=${tfSpot}&limit=${requestLimit}`
      : `${BITGET_REST}/api/v2/spot/market/candles?symbol=${local}&granularity=${tfSpot}&limit=${requestLimit}`;
    if (endTime) url += `&endTime=${endTime}`;
    const data = await this.fetchRaw<{ data: string[][] }>(url);
    return (data.data || []).map((k): Candle => ({
      exchange: 'bitget', marketType: 'spot', symbol, timeframe, time: parseInt(k[0], 10),
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]), isClosed: true, trades: 0,
    })).sort((a, b) => a.time - b.time);
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toBitgetSpotSymbol(symbol);
    const data = await this.fetchRaw<{ data: { bids: [string, string][]; asks: [string, string][] } }>(`${BITGET_REST}/api/v2/spot/market/orderbook?symbol=${local}&limit=${limit}`);
    return {
      symbol, exchange: 'bitget',
      bids: (data.data?.bids || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: (data.data?.asks || []).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
    };
  }

  private async fetchRaw<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`[bitget] HTTP ${response.status}: ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  disconnect(): void {
    super.disconnect();
    this.stopFuturesHeartbeat();
    this.stopSpotHeartbeat();
    if (this.futuresReconnectTimer) {
      clearTimeout(this.futuresReconnectTimer);
      this.futuresReconnectTimer = null;
    }
    if (this.futuresWs) { this.futuresWs.removeAllListeners(); this.futuresWs.close(); this.futuresWs = null; }
    this.futuresConnected = false;
    this.futuresSubscriptions.clear();
    this.activeFuturesSubs.clear();
  }

  isConnected(): boolean {
    return this.connected || this.futuresConnected;
  }
}
