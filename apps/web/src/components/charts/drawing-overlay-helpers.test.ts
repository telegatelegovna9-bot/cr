import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getLocalOverlayPoint,
  panLogicalRange,
  shouldStartTemporaryMeasure,
  toRangeMetricCandles,
} from './drawing-overlay-helpers.ts';

test('getLocalOverlayPoint scales client coordinates into overlay space', () => {
  const point = getLocalOverlayPoint(
    250,
    160,
    { left: 100, top: 50, width: 300, height: 150 },
    600,
    300,
  );

  assert.deepEqual(point, { x: 300, y: 220 });
});

test('panLogicalRange shifts visible range by drag distance', () => {
  const nextRange = panLogicalRange({ from: 100, to: 200 }, 50, 500);

  assert.deepEqual(nextRange, { from: 90, to: 190 });
});

test('panLogicalRange returns null without a valid range', () => {
  assert.equal(panLogicalRange(null, 50, 500), null);
  assert.equal(panLogicalRange({ from: 100, to: 200 }, 50, 0), null);
});

test('toRangeMetricCandles maps raw chart history into time and volume pairs', () => {
  const candles = toRangeMetricCandles([
    { time: 1719446520000, volume: 10, open: 1, high: 2, low: 1, close: 2 },
    { timestamp: 1719446580000, volume: 20, open: 2, high: 3, low: 2, close: 3 },
    { time: 1719446640, volume: 30, open: 3, high: 4, low: 2, close: 4 },
  ]);

  assert.deepEqual(candles, [
    { time: 1719446520, volume: 10 },
    { time: 1719446580, volume: 20 },
    { time: 1719446640, volume: 30 },
  ]);
});

test('shouldStartTemporaryMeasure only allows shift plus primary button', () => {
  assert.equal(shouldStartTemporaryMeasure({ shiftKey: true, button: 0 }), true);
  assert.equal(shouldStartTemporaryMeasure({ shiftKey: false, button: 0 }), false);
  assert.equal(shouldStartTemporaryMeasure({ shiftKey: true, button: 2 }), false);
});
