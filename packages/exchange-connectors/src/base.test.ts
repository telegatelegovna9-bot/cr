import assert from 'node:assert/strict';
import { BaseExchangeConnector } from './base';
import type { Candle, OrderBook, Ticker, Timeframe } from '@crypto-screener/shared';

class TestConnector extends BaseExchangeConnector {
  async connectWS(): Promise<void> {}
  subscribeTicker(symbol: string): void { this.subscriptions.add(`ticker:${symbol}`); }
  subscribeCandle(symbol: string, timeframe: Timeframe): void { this.subscriptions.add(`candle:${symbol}:${timeframe}`); }
  subscribeOrderBook(symbol: string): void { this.subscriptions.add(`orderbook:${symbol}`); }
  subscribeTrades(symbol: string): void { this.subscriptions.add(`trades:${symbol}`); }
  unsubscribeTicker(symbol: string): void { this.subscriptions.delete(`ticker:${symbol}`); }
  unsubscribeCandle(symbol: string, timeframe: Timeframe): void { this.subscriptions.delete(`candle:${symbol}:${timeframe}`); }
  unsubscribeOrderBook(symbol: string): void { this.subscriptions.delete(`orderbook:${symbol}`); }
  unsubscribeTrades(symbol: string): void { this.subscriptions.delete(`trades:${symbol}`); }
  async fetchTickers(_symbols?: string[]): Promise<Ticker[]> { return []; }
  async fetchCandles(_symbol: string, _timeframe: Timeframe, _limit?: number, _endTime?: number): Promise<Candle[]> { return []; }
  async fetchOrderBook(_symbol: string, _limit?: number): Promise<OrderBook> {
    return { exchange: 'binance', symbol: 'BTC/USDT', bids: [], asks: [], timestamp: Date.now() };
  }
  protected handleMessage(_msg: unknown): void {}
  exposeSetupWebSocket(ws: any) { this.setupWebSocket(ws); }
  exposeSubscriptions() { return this.subscriptions; }
}

class FakeSocket {
  private handlers = new Map<string, Array<(...args: any[]) => void>>();
  readyState = 1;

  on(event: string, handler: (...args: any[]) => void) {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  send(_payload: string) {}

  emit(event: string, ...args: any[]) {
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
  }
}

async function runTest() {
  const connector = new TestConnector({
    id: 'binance',
    wsUrl: 'ws://test',
    restUrl: 'https://test',
    rateLimit: 100,
  });
  const socket = new FakeSocket();

  connector.exposeSetupWebSocket(socket);
  connector.subscribeTicker('BTC/USDT');

  socket.emit('close');

  assert.equal(connector.exposeSubscriptions().has('ticker:BTC/USDT'), true);
  console.log('BaseExchangeConnector tests passed!');
}

runTest().catch(err => {
  console.error('BaseExchangeConnector tests failed:', err);
  process.exit(1);
});
