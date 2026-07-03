// MEXC exchange connector — spot + futures WebSocket

import WebSocket from 'ws';
import type { Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { normalizeSymbol, timeframeToMs, WS_RECONNECT_DELAY } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';
import { decodeMexcSpotMessage, type MexcSpotDecodedMessage } from './mexc-spot-proto';

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
const MEXC_SPOT_MINI_TICKERS_STREAM = 'spot@public.miniTickers.v3.api.pb@UTC+8';

type MexcJsonMessage = Record<string, unknown> & {
  __marketType?: 'futures';
  msg?: string;
  c?: string;
  d?: unknown;
};

export class MexcConnector extends BaseExchangeConnector {
  private static readonly FUTURES_CANDLE_THROTTLE_MS = 500;
  private static readonly SPOT_ORDERBOOK_THROTTLE_MS = 250;
  private futuresWs: WebSocket | null = null;
  private futuresConnected = false;
  private futuresSubscriptions = new Set<string>();
  private activeFuturesSubs = new Set<string>();
  private activeSpotSubs = new Set<string>();
  private watchedSpotTickerSymbols = new Set<string>();
  private futuresHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private spotHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private futuresReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private futuresCandleEmitTimes = new Map<string, number>();
  private spotOrderBookEmitTimes = new Map<string, number>();

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
    spotWs.on('message', (data, isBinary) => {
      const raw = typeof data === 'string'
        ? Buffer.from(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);

      if (!isBinary) {
        const text = raw.toString('utf8').trimStart();
        if (text.startsWith('{') || text.startsWith('[')) return;
      }

      const decoded = decodeMexcSpotMessage(raw);
      if (decoded) this.handleMessage(decoded);
    });
    spotWs.on('close', () => {
      console.warn('[mexc] Spot WS closed');
      this.stopSpotHeartbeat();
    });
    spotWs.on('open', () => {
      this.startSpotHeartbeat();
      for (const sub of this.activeSpotSubs) {
        this.send({ method: 'SUBSCRIPTION', params: [sub] });
      }
    });

    const futuresWs = new WebSocket(MEXC_FUTURES_WS);
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
      console.warn(`[mexc] Futures WS error: ${err.message}`);
    });
  }

  private reconnectFuturesWS(): void {
    if (this.futuresWs) return;
    this.setupFuturesWebSocket(new WebSocket(MEXC_FUTURES_WS));
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

  private sendFuturesSubscription(op: 'subscribe' | 'unsubscribe', stream: string): void {
    const [method, symbol, interval] = stream.split('|');
    if (!method || !symbol) return;
    const param = interval ? { symbol, interval } : { symbol };
    this.sendFutures({ method: `${op === 'subscribe' ? 'sub' : 'unsub'}.${method}`, param });
  }

  subscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const key = `ticker:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `ticker|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
      return;
    }
    const key = `ticker:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    this.watchedSpotTickerSymbols.add(this.toMexcSpotSymbol(symbol));
    if (!this.activeSpotSubs.has(MEXC_SPOT_MINI_TICKERS_STREAM)) {
      this.activeSpotSubs.add(MEXC_SPOT_MINI_TICKERS_STREAM);
      this.send({ method: 'SUBSCRIPTION', params: [MEXC_SPOT_MINI_TICKERS_STREAM] });
    }
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const tf = TIMEFRAME_MAP[timeframe];
      const key = `candle:${symbol}:${timeframe}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `kline|${local}|${tf}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    const key = `candle:${symbol}:${timeframe}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    const stream = `spot@public.kline.v3.api.pb@${local}@${tf}`;
    this.activeSpotSubs.add(stream);
    this.send({ method: 'SUBSCRIPTION', params: [stream] });
  }

  subscribeOrderBook(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const key = `orderbook:${symbol}`;
      if (this.futuresSubscriptions.has(key)) return;
      this.futuresSubscriptions.add(key);
      const stream = `depth|${local}`;
      this.activeFuturesSubs.add(stream);
      this.sendFuturesSubscription('subscribe', stream);
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    const key = `orderbook:${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.subscriptions.add(key);
    const stream = `spot@public.limit.depth.v3.api.pb@${local}@20`;
    this.activeSpotSubs.add(stream);
    this.send({ method: 'SUBSCRIPTION', params: [stream] });
  }

  subscribeTrades(symbol: string): void {
    // MEXC currently blocks both protobuf and JSON public spot deals streams from this runtime,
    // and futures trades are not implemented. Keep ticker updates on the dedicated ticker stream
    // instead of adding a broken or noisy fallback subscription here.
    return;
  }

  unsubscribeTicker(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`ticker:${symbol}`);
      const stream = `ticker|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
      return;
    }
    this.subscriptions.delete(`ticker:${symbol}`);
    this.watchedSpotTickerSymbols.delete(this.toMexcSpotSymbol(symbol));
    if (this.watchedSpotTickerSymbols.size === 0 && this.activeSpotSubs.has(MEXC_SPOT_MINI_TICKERS_STREAM)) {
      this.activeSpotSubs.delete(MEXC_SPOT_MINI_TICKERS_STREAM);
      this.send({ method: 'UNSUBSCRIPTION', params: [MEXC_SPOT_MINI_TICKERS_STREAM] });
    }
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      const tf = TIMEFRAME_MAP[timeframe];
      this.futuresSubscriptions.delete(`candle:${symbol}:${timeframe}`);
      const stream = `kline|${local}|${tf}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    const tf = TIMEFRAME_MAP[timeframe];
    this.subscriptions.delete(`candle:${symbol}:${timeframe}`);
    const stream = `spot@public.kline.v3.api.pb@${local}@${tf}`;
    this.activeSpotSubs.delete(stream);
    this.send({ method: 'UNSUBSCRIPTION', params: [stream] });
  }

  unsubscribeOrderBook(symbol: string): void {
    if (this.isFuturesSymbol(symbol)) {
      const local = this.toMexcFuturesSymbol(symbol);
      this.futuresSubscriptions.delete(`orderbook:${symbol}`);
      const stream = `depth|${local}`;
      this.activeFuturesSubs.delete(stream);
      this.sendFuturesSubscription('unsubscribe', stream);
      return;
    }
    const local = this.toMexcSpotSymbol(symbol);
    this.subscriptions.delete(`orderbook:${symbol}`);
    const stream = `spot@public.limit.depth.v3.api.pb@${local}@20`;
    this.activeSpotSubs.delete(stream);
    this.send({ method: 'UNSUBSCRIPTION', params: [stream] });
  }

  unsubscribeTrades(symbol: string): void {
    return;
  }

  protected handleMessage(msg: Record<string, unknown> | MexcSpotDecodedMessage): void {
    if ('channel' in msg) {
      const protoChannel = msg.channel;
      if (typeof protoChannel === 'string' && protoChannel.includes('.pb')) {
        this.handleSpotProtoMessage(msg as MexcSpotDecodedMessage);
        return;
      }
    }

    const jsonMsg = msg as MexcJsonMessage;
    const isFutures = jsonMsg.__marketType === 'futures';
    if (isFutures) { this.handleFuturesMessage(jsonMsg); return; }
    if (typeof jsonMsg.msg === 'string' && jsonMsg.msg.includes('Blocked')) return;
    const channel = jsonMsg.c;
    if (!channel) return;
    if (channel.includes('miniTickers')) {
      const d = jsonMsg.d; if (!d) return;
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
      const data = jsonMsg.d as any; if (!data?.k) return;
      const parts = channel.split('@');
      this.emit('candle', {
        exchange: 'mexc', marketType: 'spot', symbol: normalizeSymbol(parts[2], 'mexc'), timeframe: parts[3] || '1m',
        time: data.k.t, open: parseFloat(data.k.o), high: parseFloat(data.k.h), low: parseFloat(data.k.l),
        close: parseFloat(data.k.c), volume: parseFloat(data.k.v), isClosed: !!data.k.X, trades: 0,
      } as Candle);
    } else if (channel.includes('depth')) {
      const data = jsonMsg.d as any; if (!data) return;
      const parts = channel.split('@');
      this.emit('orderbook', {
        symbol: normalizeSymbol(parts[2], 'mexc'), exchange: 'mexc', marketType: 'spot',
        bids: (data.b || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: (data.a || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      } as OrderBook);
    } else if (channel.includes('deals')) {
      const data = jsonMsg.d as any; if (!data) return;
      const parts = channel.split('@');
      (data.deals || [data]).forEach((t: any) => {
        this.emit('trade', {
          id: String(t.i || Date.now()), symbol: normalizeSymbol(parts[2], 'mexc'), exchange: 'mexc',
          price: parseFloat(t.p), quantity: parseFloat(t.v), side: t.S === 1 ? 'buy' : 'sell', timestamp: t.t,
        } as Trade);
      });
    }
  }

  private handleSpotProtoMessage(msg: MexcSpotDecodedMessage): void {
    const channel = msg.channel;
    if (!channel) return;

    if (channel.includes('miniTicker') && !channel.includes('miniTickers')) {
      const item = msg.publicMiniTicker;
      if (!item?.symbol || !item.price) return;
      this.emitSpotTicker(item, msg.sendTime || msg.createTime || Date.now());
      return;
    }

    if (channel.includes('miniTickers')) {
      const items = msg.publicMiniTickers?.items || [];
      for (const item of items) {
        if (!item.symbol || !this.watchedSpotTickerSymbols.has(item.symbol)) continue;
        if (!item.symbol?.endsWith('USDT') || !item.price) continue;
        this.emitSpotTicker(item, msg.sendTime || msg.createTime || Date.now());
      }
      return;
    }

    if (channel.includes('kline')) {
      const kline = msg.publicSpotKline;
      if (!kline || !msg.symbol || !kline.interval || !kline.windowStart) return;
      this.emit('candle', {
        exchange: 'mexc',
        marketType: 'spot',
        symbol: normalizeSymbol(msg.symbol, 'mexc'),
        timeframe: this.reverseTimeframe(kline.interval),
        time: kline.windowStart * 1000,
        open: parseFloat(kline.openingPrice || '0'),
        high: parseFloat(kline.highestPrice || '0'),
        low: parseFloat(kline.lowestPrice || '0'),
        close: parseFloat(kline.closingPrice || '0'),
        volume: parseFloat(kline.volume || '0'),
        isClosed: false,
        trades: 0,
      } as Candle);
      return;
    }

    if (channel.includes('limit.depth')) {
      if (!msg.symbol || !msg.publicLimitDepths) return;
      const orderbookKey = msg.symbol;
      const now = Date.now();
      const lastEmit = this.spotOrderBookEmitTimes.get(orderbookKey) || 0;
      if (now - lastEmit < MexcConnector.SPOT_ORDERBOOK_THROTTLE_MS) return;
      this.spotOrderBookEmitTimes.set(orderbookKey, now);

      this.emit('orderbook', {
        symbol: normalizeSymbol(msg.symbol, 'mexc'),
        exchange: 'mexc',
        marketType: 'spot',
        bids: (msg.publicLimitDepths.bids || []).map(level => ({
          price: parseFloat(level.price || '0'),
          quantity: parseFloat(level.quantity || '0'),
        })),
        asks: (msg.publicLimitDepths.asks || []).map(level => ({
          price: parseFloat(level.price || '0'),
          quantity: parseFloat(level.quantity || '0'),
        })),
        timestamp: msg.sendTime || msg.createTime || now,
      } as OrderBook);
      return;
    }

  }

  private emitSpotTicker(item: { symbol?: string; price?: string; rate?: string; high?: string; low?: string; volume?: string; quantity?: string }, timestamp: number): void {
    if (!item.symbol?.endsWith('USDT') || !item.price) return;
    const price = parseFloat(item.price);
    const changePercent = parseFloat(item.rate || '0') * 100;
    const previousPrice = changePercent === -100 ? price : price / (1 + (changePercent / 100));
    this.emit('ticker', {
      exchange: 'mexc',
      marketType: 'spot',
      symbol: normalizeSymbol(item.symbol, 'mexc'),
      lastPrice: price,
      priceChange24h: price - previousPrice,
      volume24h: parseFloat(item.quantity || '0'),
      high24h: parseFloat(item.high || '0'),
      low24h: parseFloat(item.low || '0'),
      timestamp,
      priceChangePercent24h: changePercent,
      quoteVolume24h: parseFloat(item.volume || '0'),
      trades24h: 0,
      bid: price,
      ask: price,
      spread: 0,
    } as Ticker);
  }

  private handleFuturesMessage(msg: Record<string, unknown>): void {
    const channel = msg.channel as string; if (!channel || !msg.data) return;
    const data = msg.data as any;
    if (channel === 'push.ticker') {
      const rawSymbol = (msg.symbol as string) || data.symbol;
      const symbol = this.fromMexcFuturesSymbol(rawSymbol);
      const price = parseFloat(data.lastPrice);
      const bid = parseFloat(data.bid1);
      const ask = parseFloat(data.ask1);
      this.emit('ticker', {
        exchange: 'mexc', marketType: 'futures', symbol, lastPrice: price, priceChange24h: parseFloat(data.riseFallValue),
        volume24h: parseFloat(data.volume24), high24h: parseFloat(data.high24Price), low24h: parseFloat(data.lower24Price),
        timestamp: Date.now(), priceChangePercent24h: parseFloat(data.riseFallRate) * 100,
        quoteVolume24h: parseFloat(data.amount24), trades24h: 0,
        bid: Number.isFinite(bid) ? bid : price,
        ask: Number.isFinite(ask) ? ask : price,
        spread: Number.isFinite(bid) && Number.isFinite(ask) ? ask - bid : 0,
      } as Ticker);
    } else if (channel === 'push.kline') {
      const rawSymbol = (msg.symbol as string) || data.symbol;
      const symbol = this.fromMexcFuturesSymbol(rawSymbol);
      const interval = this.reverseTimeframe(data.interval || 'Min1');
      const candleKey = `${symbol}:${interval}:${data.t}`;
      const now = Date.now();
      const lastEmit = this.futuresCandleEmitTimes.get(candleKey) || 0;
      if (now - lastEmit < MexcConnector.FUTURES_CANDLE_THROTTLE_MS) return;
      this.futuresCandleEmitTimes.set(candleKey, now);
      this.emit('candle', {
        exchange: 'mexc',
        marketType: 'futures',
        symbol,
        timeframe: interval,
        time: Number(data.t) * 1000,
        open: parseFloat(data.o),
        high: parseFloat(data.h),
        low: parseFloat(data.l),
        close: parseFloat(data.c),
        volume: parseFloat(data.q),
        isClosed: false,
        trades: 0,
      } as Candle);
    } else if (channel === 'push.depth') {
      const rawSymbol = (msg.symbol as string) || data.symbol;
      if (!rawSymbol) return;
      const symbol = this.fromMexcFuturesSymbol(rawSymbol);
      this.emit('orderbook', {
        symbol,
        exchange: 'mexc',
        marketType: 'futures',
        bids: (data.bids || []).map(([p, q]: [number, number]) => ({
          price: Number(p),
          quantity: Number(q),
        })),
        asks: (data.asks || []).map(([p, q]: [number, number]) => ({
          price: Number(p),
          quantity: Number(q),
        })),
        timestamp: Date.now(),
      } as OrderBook);
    }
  }

  private reverseTimeframe(tf: string): Timeframe {
    const map: Record<string, Timeframe> = {
      Min1: '1m',
      Min5: '5m',
      Min15: '15m',
      Min60: '1h',
      Hour4: '4h',
      Day1: '1d',
      Week1: '1w',
    };
    return map[tf] || '1m';
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
      const list = futuresRes.value;
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
    if (endTime) {
      const spanMs = timeframeToMs(timeframe) * Math.max(limit - 1, 1);
      const startTime = Math.max(0, endTime - spanMs);
      url += `&startTime=${startTime}&endTime=${endTime}`;
    }
    const data = await this.fetchRaw<any>(url); if (!Array.isArray(data)) return [];
    return data.map((k: any): Candle => ({
      exchange: 'mexc', marketType: 'spot', symbol, timeframe, time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]), isClosed: true, trades: 0,
    })).sort((a, b) => a.time - b.time);
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const isFutures = this.isFuturesSymbol(symbol);
    const local = isFutures ? this.toMexcFuturesSymbol(symbol) : this.toMexcSpotSymbol(symbol);
    const data = await this.fetchRaw<any>(
      isFutures
        ? `${MEXC_FUTURES_REST}/api/v1/contract/depth/${local}?limit=${limit}`
        : `${MEXC_SPOT_REST}/api/v3/depth?symbol=${local}&limit=${limit}`
    );
    return {
      symbol,
      exchange: 'mexc',
      marketType: isFutures ? 'futures' : 'spot',
      bids: (data.bids || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      asks: (data.asks || []).map(([p, q]: any) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
      timestamp: Date.now(),
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
    if (this.futuresReconnectTimer) {
      clearTimeout(this.futuresReconnectTimer);
      this.futuresReconnectTimer = null;
    }
    if (this.futuresWs) { this.futuresWs.removeAllListeners(); this.futuresWs.close(); this.futuresWs = null; }
    this.futuresConnected = false; this.futuresSubscriptions.clear(); this.activeFuturesSubs.clear(); this.activeSpotSubs.clear(); this.watchedSpotTickerSymbols.clear(); this.futuresCandleEmitTimes.clear(); this.spotOrderBookEmitTimes.clear();
  }

  isConnected(): boolean {
    return this.connected || this.futuresConnected;
  }
}
