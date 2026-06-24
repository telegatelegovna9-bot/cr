import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateRangeMetrics } from './range-metrics.ts';

test('calculateRangeMetrics returns delta percent bars time and volume for loaded candles', () => {
  const metrics = calculateRangeMetrics(
    { p1: { time: 120, price: 100 }, p2: { time: 300, price: 110 } },
    [
      { time: 60, volume: 10 },
      { time: 120, volume: 20 },
      { time: 180, volume: 30 },
      { time: 240, volume: 40 },
      { time: 300, volume: 50 },
      { time: 360, volume: 60 },
    ],
  );

  assert.deepEqual(metrics, {
    priceDelta: 10,
    percentDelta: 10,
    bars: 4,
    timeMs: 180000,
    volume: 140,
    startTime: 120,
    endTime: 300,
  });
});

test('calculateRangeMetrics ignores candles outside loaded overlap for unsorted in-range input', () => {
  const metrics = calculateRangeMetrics(
    { p1: { time: 60, price: 200 }, p2: { time: 300, price: 180 } },
    [
      { time: 0, volume: 3 },
      { time: 240, volume: 7 },
      { time: 300, volume: 9 },
      { time: 180, volume: 5 },
      { time: 360, volume: 11 },
    ],
  );

  assert.equal(metrics.bars, 3);
  assert.equal(metrics.volume, 21);
  assert.equal(metrics.priceDelta, -20);
  assert.equal(metrics.percentDelta, -10);
  assert.equal(metrics.startTime, 180);
  assert.equal(metrics.endTime, 300);
  assert.equal(metrics.timeMs, 120000);
});
