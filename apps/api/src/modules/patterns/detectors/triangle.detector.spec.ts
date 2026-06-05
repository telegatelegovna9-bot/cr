import assert from 'node:assert/strict';
import { detectTrianglePatterns } from './triangle.detector';

const validTriangleCandles = [
  { time: 1, open: 10.2, high: 11.9, low: 8.6, close: 11.4, volume: 1 },
  { time: 2, open: 11.4, high: 11.55, low: 9.0, close: 9.3, volume: 1 },
  { time: 3, open: 9.3, high: 11.25, low: 9.15, close: 10.95, volume: 1 },
  { time: 4, open: 10.95, high: 11.0, low: 9.35, close: 9.58, volume: 1 },
  { time: 5, open: 9.58, high: 10.72, low: 9.48, close: 10.55, volume: 1 },
  { time: 6, open: 10.55, high: 10.62, low: 9.62, close: 9.82, volume: 1 },
  { time: 7, open: 9.82, high: 10.28, low: 9.78, close: 10.02, volume: 1 },
  { time: 8, open: 10.02, high: 10.05, low: 9.86, close: 9.94, volume: 1 },
];

const channelCandles = [
  { time: 1, open: 10, high: 11.5, low: 8.5, close: 11.1, volume: 1 },
  { time: 2, open: 11.1, high: 11.25, low: 8.95, close: 9.2, volume: 1 },
  { time: 3, open: 9.2, high: 10.95, low: 9.0, close: 10.6, volume: 1 },
  { time: 4, open: 10.6, high: 10.75, low: 9.02, close: 9.28, volume: 1 },
  { time: 5, open: 9.28, high: 10.42, low: 9.05, close: 10.04, volume: 1 },
  { time: 6, open: 10.04, high: 10.15, low: 9.08, close: 9.34, volume: 1 },
  { time: 7, open: 9.34, high: 10.04, low: 9.1, close: 9.92, volume: 1 },
  { time: 8, open: 9.92, high: 10.0, low: 9.12, close: 9.4, volume: 1 },
];

const results = detectTrianglePatterns('SOL/USDT:USDT', '5m', validTriangleCandles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'triangle');
assert.equal(results[0].geometry.lines.length, 2);
assert.ok(results[0].geometry.pivots.length >= 6);
assert.equal(
  detectTrianglePatterns('SOL/USDT:USDT', '5m', channelCandles).length,
  0,
);
