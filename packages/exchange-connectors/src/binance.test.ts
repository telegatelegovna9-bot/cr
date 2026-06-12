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
