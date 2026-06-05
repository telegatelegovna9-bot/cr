import assert from 'node:assert/strict';
import { detectCascadePatterns } from './cascade.detector';

const staircaseCandles = [
  { time: 1, open: 10, high: 11, low: 9.8, close: 10.7, volume: 1 },
  { time: 2, open: 10.7, high: 10.9, low: 10.0, close: 10.2, volume: 1 },
  { time: 3, open: 10.2, high: 10.55, low: 9.95, close: 10.35, volume: 1 },
  { time: 4, open: 10.35, high: 10.4, low: 9.55, close: 9.8, volume: 1 },
  { time: 5, open: 9.8, high: 10.0, low: 9.62, close: 9.95, volume: 1 },
  { time: 6, open: 9.95, high: 9.98, low: 9.1, close: 9.25, volume: 1 },
  { time: 7, open: 9.25, high: 9.55, low: 9.18, close: 9.44, volume: 1 },
  { time: 8, open: 9.44, high: 9.46, low: 8.82, close: 8.9, volume: 1 },
];

const straightDownCandles = [
  { time: 1, open: 10, high: 10.1, low: 9.9, close: 9.95, volume: 1 },
  { time: 2, open: 9.95, high: 9.98, low: 9.7, close: 9.74, volume: 1 },
  { time: 3, open: 9.74, high: 9.76, low: 9.45, close: 9.5, volume: 1 },
  { time: 4, open: 9.5, high: 9.52, low: 9.2, close: 9.24, volume: 1 },
  { time: 5, open: 9.24, high: 9.26, low: 8.95, close: 8.99, volume: 1 },
  { time: 6, open: 8.99, high: 9.01, low: 8.7, close: 8.75, volume: 1 },
  { time: 7, open: 8.75, high: 8.78, low: 8.5, close: 8.54, volume: 1 },
  { time: 8, open: 8.54, high: 8.56, low: 8.3, close: 8.34, volume: 1 },
];

const results = detectCascadePatterns('BTC/USDT:USDT', '15m', staircaseCandles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'cascade');
assert.ok(results[0].quality >= 55);
assert.ok(results[0].geometry.lines.length >= 3);
assert.ok(results[0].geometry.pivots.length >= 6);
assert.equal(
  detectCascadePatterns('BTC/USDT:USDT', '15m', straightDownCandles).length,
  0,
);
