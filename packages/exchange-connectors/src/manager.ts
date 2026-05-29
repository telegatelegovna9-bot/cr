// Exchange Manager - manages all exchange connectors

import { EventEmitter } from 'events';
import type { ExchangeId, Ticker, Candle, Timeframe, OrderBook, Trade } from '@crypto-screener/shared';
import { ALL_EXCHANGES } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';
import { BinanceConnector } from './binance';
import { BybitConnector } from './bybit';
import { OKXConnector } from './okx';
import { MexcConnector } from './mexc';
import { BitgetConnector } from './bitget';
import { GenericExchangeConnector } from './generic';

export class ExchangeManager extends EventEmitter {
  private connectors = new Map<ExchangeId, BaseExchangeConnector>();
  private enabledExchanges: Set<ExchangeId>;

  constructor(enabledExchanges?: ExchangeId[]) {
    super();
    this.enabledExchanges = new Set(enabledExchanges || ALL_EXCHANGES);
    this.initConnectors();
  }

  private initConnectors(): void {
    const connectorMap: Record<ExchangeId, () => BaseExchangeConnector> = {
      binance: () => new BinanceConnector(),
      bybit: () => new BybitConnector(),
      okx: () => new OKXConnector(),
      mexc: () => new MexcConnector(),
      bitget: () => new BitgetConnector(),
      kucoin: () => new GenericExchangeConnector('kucoin'),
      gate: () => new GenericExchangeConnector('gate'),
      hyperliquid: () => new GenericExchangeConnector('hyperliquid'),
      coinbase: () => new GenericExchangeConnector('coinbase'),
    };

    for (const exchangeId of this.enabledExchanges) {
      try {
        const connector = connectorMap[exchangeId]();
        this.setupConnectorEvents(connector);
        this.connectors.set(exchangeId, connector);
      } catch (err) {
        console.error(`Failed to initialize ${exchangeId} connector:`, err);
      }
    }
  }

  private setupConnectorEvents(connector: BaseExchangeConnector): void {
    const id = connector.getExchangeId();

    connector.on('ticker', (ticker: Ticker) => this.emit('ticker', ticker));
    connector.on('candle', (candle: Candle & { symbol: string }) => this.emit('candle', candle));
    connector.on('orderbook', (ob: OrderBook) => this.emit('orderbook', ob));
    connector.on('trade', (trade: Trade) => this.emit('trade', trade));
    connector.on('connected', () => this.emit('exchange_connected', id));
    connector.on('disconnected', () => this.emit('exchange_disconnected', id));
    connector.on('error', (err: Error) => this.emit('exchange_error', { exchange: id, error: err }));
  }

  async connectAll(): Promise<void> {
    const promises = Array.from(this.connectors.values()).map(connector =>
      connector.connectWS().catch(err => {
        console.error(`Failed to connect ${connector.getExchangeId()}:`, err.message);
      })
    );
    await Promise.allSettled(promises);
  }

  async connect(exchangeId: ExchangeId): Promise<void> {
    const connector = this.connectors.get(exchangeId);
    if (connector) {
      await connector.connectWS();
    }
  }

  getConnector(exchangeId: ExchangeId): BaseExchangeConnector | undefined {
    return this.connectors.get(exchangeId);
  }

  // Subscribe to ticker across all exchanges
  subscribeTicker(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) c.subscribeTicker(symbol);
    }
  }

  subscribeCandle(symbol: string, timeframe: Timeframe, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) c.subscribeCandle(symbol, timeframe);
    }
  }

  subscribeOrderBook(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) c.subscribeOrderBook(symbol);
    }
  }

  subscribeTrades(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) c.subscribeTrades(symbol);
    }
  }

  unsubscribeTicker(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c) c.unsubscribeTicker(symbol);
    }
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c) c.unsubscribeCandle(symbol, timeframe);
    }
  }

  unsubscribeOrderBook(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c) c.unsubscribeOrderBook(symbol);
    }
  }

  unsubscribeTrades(symbol: string, exchanges?: ExchangeId[]): void {
    const targets = exchanges || Array.from(this.connectors.keys());
    for (const id of targets) {
      const c = this.connectors.get(id);
      if (c) c.unsubscribeTrades(symbol);
    }
  }

  // Aggregated tickers from all exchanges
  async fetchAllTickers(symbols?: string[]): Promise<Ticker[]> {
    const results = await Promise.allSettled(
      Array.from(this.connectors.values()).map(c => c.fetchTickers(symbols))
    );

    const tickers: Ticker[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') tickers.push(...r.value);
    }

    return tickers;
  }

  // Fetch candles from a specific exchange (or best available)
  async fetchCandles(
    symbol: string,
    timeframe: Timeframe,
    exchange?: ExchangeId,
    limit = 500,
    endTime?: number,
  ): Promise<Candle[]> {
    if (exchange) {
      const c = this.connectors.get(exchange);
      if (c) return c.fetchCandles(symbol, timeframe, limit, endTime);
      throw new Error(`Exchange ${exchange} not available`);
    }

    // Try preferred order
    const preferred: ExchangeId[] = ['binance', 'bybit', 'okx'];
    for (const id of preferred) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) {
        try {
          return await c.fetchCandles(symbol, timeframe, limit, endTime);
        } catch { /* try next */ }
      }
    }

    // Try any available
    for (const c of this.connectors.values()) {
      if (c.isConnected()) {
        try {
          return await c.fetchCandles(symbol, timeframe, limit, endTime);
        } catch { /* try next */ }
      }
    }

    return [];
  }

  // Fetch order book from best exchange
  async fetchOrderBook(symbol: string, exchange?: ExchangeId): Promise<OrderBook | null> {
    if (exchange) {
      const c = this.connectors.get(exchange);
      if (c) return c.fetchOrderBook(symbol);
      return null;
    }

    const preferred: ExchangeId[] = ['binance', 'bybit', 'okx'];
    for (const id of preferred) {
      const c = this.connectors.get(id);
      if (c?.isConnected()) {
        try {
          return await c.fetchOrderBook(symbol);
        } catch { /* try next */ }
      }
    }

    return null;
  }

  getConnectedExchanges(): ExchangeId[] {
    return Array.from(this.connectors.entries())
      .filter(([_, c]) => c.isConnected())
      .map(([id]) => id);
  }

  disconnectAll(): void {
    for (const connector of this.connectors.values()) {
      connector.disconnect();
    }
  }
}
