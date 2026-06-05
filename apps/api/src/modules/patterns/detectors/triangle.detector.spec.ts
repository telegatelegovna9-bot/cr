import assert from 'node:assert/strict';
import { detectTrianglePatterns } from './triangle.detector';

const candles = [
  { time: 1, open: 10, high: 12, low: 8, close: 10.5, volume: 1 },
  { time: 2, open: 10.5, high: 11.7, low: 8.4, close: 10.6, volume: 1 },
  { time: 3, open: 10.6, high: 11.3, low: 8.8, close: 10.2, volume: 1 },
  { time: 4, open: 10.2, high: 11.0, low: 9.1, close: 10.4, volume: 1 },
  { time: 5, open: 10.4, high: 10.8, low: 9.3, close: 10.1, volume: 1 },
  { time: 6, open: 10.1, high: 10.6, low: 9.5, close: 10.0, volume: 1 },
];

const results = detectTrianglePatterns('SOL/USDT:USDT', '5m', candles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'triangle');
assert.equal(results[0].geometry.lines.length, 2);
