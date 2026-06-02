import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldTriggerSignal, mapSignalToAlert } from './useSignalMonitor';

test('one-shot signal triggers once when crossing and then stops', () => {
  // Cross from below
  const first = shouldTriggerSignal({ last: 99, current: 101, level: 100, armed: true, triggered: false });
  // Already triggered
  const second = shouldTriggerSignal({ last: 101, current: 102, level: 100, armed: false, triggered: true });
  
  assert.equal(first, true);
  assert.equal(second, false);
});

test('one-shot signal triggers when crossing from above', () => {
  const hit = shouldTriggerSignal({ last: 101, current: 99, level: 100, armed: true, triggered: false });
  assert.equal(hit, true);
});

test('signal does not trigger if not crossing', () => {
  const miss = shouldTriggerSignal({ last: 90, current: 95, level: 100, armed: true, triggered: false });
  assert.equal(miss, false);
});

test('mapSignalToAlert creates correct alert payload', () => {
  const alert = mapSignalToAlert({
    id: 'sig-1',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    price: 100000,
    current: 100100,
  } as any);
  
  assert.equal(alert.symbol, 'BTC/USDT');
  assert.equal(alert.value, 100000);
  assert.equal(alert.type, 'price_cross');
});
