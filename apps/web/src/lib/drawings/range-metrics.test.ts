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
    volume: 140,
    rangeStartTime: 120,
    rangeEndTime: 300,
    overlapStartTime: 120,
    overlapEndTime: 300,
    overlapTimeMs: 180000,
  });
});

test('calculateRangeMetrics tracks explicit overlap bounds for unsorted loaded candles', () => {
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
  assert.equal(metrics.rangeStartTime, 60);
  assert.equal(metrics.rangeEndTime, 300);
  assert.equal(metrics.overlapStartTime, 180);
  assert.equal(metrics.overlapEndTime, 300);
  assert.equal(metrics.overlapTimeMs, 120000);
});
