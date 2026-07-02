import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BinanceConnector } from './binance';

class FakeSocket {
  private handlers = new Map<string, Array<(...args: any[]) => void>>();
  public readonly sent: string[] = [];
  readyState = 0;

  on(event: string, handler: (...args: any[]) => void) {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  once(event: string, handler: (...args: any[]) => void) {
    const onceHandler = (...args: any[]) => {
      this.off(event, onceHandler);
      handler(...args);
    };
    return this.on(event, onceHandler);
  }

  off(event: string, handler: (...args: any[]) => void) {
    const existing = this.handlers.get(event) || [];
    this.handlers.set(event, existing.filter(current => current !== handler));
    return this;
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
  }

  emit(event: string, ...args: any[]) {
    if (event === 'open') this.readyState = 1;
    if (event === 'close') this.readyState = 3;
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
  }
}

test('replays active spot subscriptions when the spot websocket opens', async () => {
  const connector = new BinanceConnector();
  const socket = new FakeSocket();

  (connector as any).setupSpotWS(socket);
  connector.subscribeTicker('BTC/USDT');
  connector.subscribeCandle('BTC/USDT', '1m');

  socket.emit('open');
  await new Promise(resolve => setTimeout(resolve, 300));

  assert.equal(socket.sent.length, 1);
  const payload = JSON.parse(socket.sent[0]);
  assert.equal(payload.method, 'SUBSCRIBE');
  assert.deepEqual(new Set(payload.params), new Set(['btcusdt@ticker', 'btcusdt@kline_1m']));
});

test('merges spot depth diffs into a local order book instead of emitting raw deltas', () => {
  const connector = new BinanceConnector();
  const emitted: any[] = [];

  connector.on('orderbook', orderbook => emitted.push(orderbook));

  (connector as any).localOrderBooks.set('spot:BTC/USDT', {
    symbol: 'BTC/USDT',
    marketType: 'spot',
    bids: new Map([[100, 2], [99, 1]]),
    asks: new Map([[101, 3], [102, 4]]),
    lastUpdateId: 10,
    previousStreamUpdateId: 10,
    buffer: [],
    synced: true,
    syncing: false,
  });

  (connector as any).handleDepthUpdate({
    __marketType: 'spot',
    s: 'BTCUSDT',
    U: 11,
    u: 12,
    b: [['100', '5'], ['98', '7']],
    a: [['101', '0'], ['103', '6']],
  });

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].bids.slice(0, 3), [
    { price: 100, quantity: 5 },
    { price: 99, quantity: 1 },
    { price: 98, quantity: 7 },
  ]);
  assert.deepEqual(emitted[0].asks.slice(0, 2), [
    { price: 102, quantity: 4 },
    { price: 103, quantity: 6 },
  ]);
});
