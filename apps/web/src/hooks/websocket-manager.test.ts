import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSharedWebSocketManager,
  type ManagedSubscription,
} from './websocket-manager';

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

function createSubscription(overrides: Partial<ManagedSubscription> = {}): ManagedSubscription {
  return {
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    timeframe: '1m',
    channel: undefined,
    ...overrides,
  };
}

test('keeps shared subscriptions alive until the last consumer unsubscribes', () => {
  const sockets: FakeSocket[] = [];
  const manager = createSharedWebSocketManager({
    url: 'ws://test.local/ws',
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as never;
    },
  });

  manager.connect();
  assert.equal(sockets.length, 1);
  sockets[0].open();

  const subscription = createSubscription();
  manager.subscribe(subscription);
  manager.subscribe(subscription);

  assert.deepEqual(sockets[0].sent, [JSON.stringify({ action: 'subscribe', ...subscription })]);

  manager.unsubscribe(subscription);
  assert.deepEqual(
    sockets[0].sent,
    [JSON.stringify({ action: 'subscribe', ...subscription })],
  );

  manager.unsubscribe(subscription);
  assert.deepEqual(
    sockets[0].sent,
    [
      JSON.stringify({ action: 'subscribe', ...subscription }),
      JSON.stringify({ action: 'unsubscribe', ...subscription }),
    ],
  );
});

test('replays active subscriptions once after an immediate visibility recovery', () => {
  const sockets: FakeSocket[] = [];
  const scheduledTimers = new Map<number, () => void>();
  let nextTimerId = 1;

  const manager = createSharedWebSocketManager({
    url: 'ws://test.local/ws',
    reconnectDelayMs: 3000,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as never;
    },
    scheduleTimeout: (callback) => {
      const id = nextTimerId++;
      scheduledTimers.set(id, callback);
      return id;
    },
    clearScheduledTimeout: (id) => {
      scheduledTimers.delete(id);
    },
  });

  manager.connect();
  sockets[0].open();

  const subscription = createSubscription({ symbol: 'ETH/USDT', timeframe: '5m' });
  manager.subscribe(subscription);
  assert.deepEqual(sockets[0].sent, [JSON.stringify({ action: 'subscribe', ...subscription })]);

  sockets[0].close(1006, 'sleep');
  assert.equal(scheduledTimers.size, 1);

  manager.handleVisibilityVisible();
  assert.equal(sockets.length, 2);
  assert.equal(scheduledTimers.size, 0);

  sockets[1].open();
  assert.deepEqual(sockets[1].sent, [JSON.stringify({ action: 'subscribe', ...subscription })]);
});
