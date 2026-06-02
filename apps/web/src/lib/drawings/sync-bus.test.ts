import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DrawingOperationEvent } from './models';
import { createDrawingSyncBus } from './sync-bus';

test('sync bus forwards remote events and ignores same-origin events', () => {
  const events: DrawingOperationEvent[] = [];
  const bus = createDrawingSyncBus('origin-a');
  const unsubscribe = bus.subscribe(event => events.push(event));

  bus.emit({
    type: 'visibility',
    origin: 'origin-b',
    hidden: true,
    instrumentKey: 'binance:futures:BTC/USDT:USDT',
    occurredAt: Date.now(),
  });
  bus.emit({
    type: 'visibility',
    origin: 'origin-a',
    hidden: false,
    instrumentKey: 'binance:futures:BTC/USDT:USDT',
    occurredAt: Date.now(),
  });

  unsubscribe();
  bus.dispose();

  assert.equal(events.length, 1);
  assert.equal(events[0].origin, 'origin-b');
  assert.equal(events[0].type, 'visibility');
});
