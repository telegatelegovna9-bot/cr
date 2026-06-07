import assert from 'node:assert/strict';
import {
  clampQuality,
  patternsOverlapTooMuch,
  toPivotWindow,
} from './detector.utils';

assert.equal(clampQuality(-5), 0);
assert.equal(clampQuality(48.8), 49);
assert.equal(clampQuality(140), 100);

const pivots = toPivotWindow([
  { time: 1, open: 1, high: 10, low: 1, close: 5, volume: 1 },
  { time: 2, open: 5, high: 12, low: 4, close: 10, volume: 1 },
  { time: 3, open: 10, high: 11, low: 2, close: 3, volume: 1 },
]);

assert.equal(pivots.length, 3);
assert.equal(pivots[1].high, 12);
assert.equal(pivots[1].index, 1);

assert.equal(
  patternsOverlapTooMuch(
    { kind: 'breakout', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 100, to: 200 },
    { kind: 'breakout', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 120, to: 205 },
  ),
  true,
);

assert.equal(
  patternsOverlapTooMuch(
    { kind: 'breakout', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 100, to: 200 },
    { kind: 'retest', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 120, to: 205 },
  ),
  false,
);
