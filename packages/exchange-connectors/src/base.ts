// Base exchange connector - abstract class for all exchanges

import { EventEmitter } from 'events';
import type {
  ExchangeId,
  Ticker,
  Candle,
  Timeframe,
  OrderBook,
  Trade,
} from '@crypto-screener/shared';
import {
  normalizeSymbol,
  toExchangeSymbol,
  timeframeToMs,
  WS_RECONNECT_DELAY,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_HEARTBEAT_INTERVAL,
} from '@crypto-screener/shared';

export interface ExchangeConnectorOptions {
  id: ExchangeId;
  wsUrl: string;
  restUrl: string;
  rateLimit: number;
}

export abstract class BaseExchangeConnector extends EventEmitter {
  protected readonly id: ExchangeId;
  protected readonly wsUrl: string;
  protected readonly restUrl: string;
  protected readonly rateLimit: number;

  protected ws: import('ws').WebSocket | null = null;
  protected reconnectAttempts = 0;
  protected heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  protected connected = false;
  protected subscriptions = new Set<string>();

  // Rate limiting
  private requestTimes: number[] = [];

  constructor(options: ExchangeConnectorOptions) {
    super();
    this.id = options.id;
    this.wsUrl = options.wsUrl;
    this.restUrl = options.restUrl;
    this.rateLimit = options.rateLimit;
  }

  // Abstract methods to implement per exchange
  abstract connectWS(): Promise<void>;
  abstract subscribeTicker(symbol: string): void;
  abstract subscribeCandle(symbol: string, timeframe: Timeframe): void;
  abstract subscribeOrderBook(symbol: string): void;
  abstract subscribeTrades(symbol: string): void;
  abstract unsubscribeTicker(symbol: string): void;
  abstract unsubscribeCandle(symbol: string, timeframe: Timeframe): void;
  abstract unsubscribeOrderBook(symbol: string): void;
  abstract unsubscribeTrades(symbol: string): void;

  // REST methods
  abstract fetchTickers(symbols?: string[]): Promise<Ticker[]>;
  abstract fetchCandles(symbol: string, timeframe: Timeframe, limit?: number, endTime?: number): Promise<Candle[]>;
  abstract fetchOrderBook(symbol: string, limit?: number): Promise<OrderBook>;

  // Common REST fetch with rate limiting
  protected async fetch<T>(endpoint: string): Promise<T> {
    await this.waitForRateLimit();
    const url = `${this.restUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`[${this.id}] HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const window = 60_000; // 1 minute

    // Remove old requests
    this.requestTimes = this.requestTimes.filter(t => now - t < window);

    if (this.requestTimes.length >= this.rateLimit) {
      const oldest = this.requestTimes[0];
      const waitMs = window - (now - oldest) + 100;
      await new Promise(r => setTimeout(r, waitMs));
    }

    this.requestTimes.push(Date.now());
  }

  // WebSocket helpers
  protected setupWebSocket(ws: import('ws').WebSocket): void {
    this.ws = ws;
    this.connected = true;
    this.reconnectAttempts = 0;

    ws.on('open', () => {
      this.connected = true;
      this.emit('connected');
      this.startHeartbeat();
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // Some exchanges send binary or non-JSON messages
      }
    });

    ws.on('close', () => {
      this.connected = false;
      this.stopHeartbeat();
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  protected abstract handleMessage(msg: unknown): void;

  protected send(data: unknown): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.send(this.getPingMessage());
      }
    }, WS_HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  protected getPingMessage(): unknown {
    return { op: 'ping' };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
      this.emit('max_reconnect');
      return;
    }

    const delay = WS_RECONNECT_DELAY * Math.min(this.reconnectAttempts + 1, 5);
    this.reconnectAttempts++;

    setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this.connectWS().catch(err => this.emit('error', err));
    }, delay);
  }

  // Utility
  protected toLocalSymbol(symbol: string): string {
    return toExchangeSymbol(symbol, this.id);
  }

  protected fromLocalSymbol(raw: string): string {
    return normalizeSymbol(raw, this.id);
  }

  getExchangeId(): ExchangeId {
    return this.id;
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscriptions.clear();
  }
}
