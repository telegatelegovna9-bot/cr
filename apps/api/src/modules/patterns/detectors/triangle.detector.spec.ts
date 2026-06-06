import assert from 'node:assert/strict';
import { detectTrianglePatterns } from './triangle.detector';

const shortLocalTriangleCandles = [
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

const microTriangleCandles = [
  ...Array.from({ length: 20 }, (_, index) => ({
    time: index + 1,
    open: 30 + (index % 4) * 0.05,
    high: 30.4 + (index % 5) * 0.04,
    low: 29.8 - (index % 3) * 0.03,
    close: 30 + ((index + 2) % 4) * 0.02,
    volume: 1,
  })),
  { time: 21, open: 30.15, high: 31.5, low: 29.2, close: 31.18, volume: 1 },
  { time: 22, open: 31.18, high: 31.24, low: 29.55, close: 29.8, volume: 1 },
  { time: 23, open: 29.8, high: 31.1, low: 29.72, close: 30.82, volume: 1 },
  { time: 24, open: 30.82, high: 30.88, low: 29.86, close: 30.02, volume: 1 },
  { time: 25, open: 30.02, high: 30.72, low: 29.95, close: 30.45, volume: 1 },
  { time: 26, open: 30.45, high: 30.5, low: 30.05, close: 30.18, volume: 1 },
  { time: 27, open: 30.18, high: 30.42, low: 30.12, close: 30.28, volume: 1 },
  { time: 28, open: 30.28, high: 30.3, low: 30.16, close: 30.22, volume: 1 },
];

const broadTriangleCandles = [
  { time: 1, open: 20.2, high: 25.6, low: 19.8, close: 24.8, volume: 1 },
  { time: 2, open: 24.8, high: 25.0, low: 21.4, close: 22.0, volume: 1 },
  { time: 3, open: 22.0, high: 23.6, low: 18.1, close: 18.8, volume: 1 },
  { time: 4, open: 18.8, high: 22.9, low: 18.5, close: 22.4, volume: 1 },
  { time: 5, open: 22.4, high: 24.9, low: 21.8, close: 24.3, volume: 1 },
  { time: 6, open: 24.3, high: 24.4, low: 21.9, close: 22.4, volume: 1 },
  { time: 7, open: 22.4, high: 23.2, low: 18.9, close: 19.5, volume: 1 },
  { time: 8, open: 19.5, high: 22.8, low: 19.2, close: 22.1, volume: 1 },
  { time: 9, open: 22.1, high: 24.2, low: 21.6, close: 23.8, volume: 1 },
  { time: 10, open: 23.8, high: 24.0, low: 21.8, close: 22.2, volume: 1 },
  { time: 11, open: 22.2, high: 22.8, low: 19.7, close: 20.1, volume: 1 },
  { time: 12, open: 20.1, high: 22.5, low: 19.9, close: 22.0, volume: 1 },
  { time: 13, open: 22.0, high: 23.6, low: 21.5, close: 23.1, volume: 1 },
  { time: 14, open: 23.1, high: 23.2, low: 21.7, close: 22.0, volume: 1 },
  { time: 15, open: 22.0, high: 22.5, low: 20.5, close: 20.8, volume: 1 },
  { time: 16, open: 20.8, high: 22.2, low: 20.7, close: 21.9, volume: 1 },
  { time: 17, open: 21.9, high: 22.9, low: 21.4, close: 22.6, volume: 1 },
  { time: 18, open: 22.6, high: 22.7, low: 21.5, close: 21.9, volume: 1 },
  { time: 19, open: 21.9, high: 22.3, low: 21.0, close: 21.2, volume: 1 },
  { time: 20, open: 21.2, high: 22.0, low: 21.1, close: 21.8, volume: 1 },
  { time: 21, open: 21.8, high: 22.3, low: 21.3, close: 22.0, volume: 1 },
  { time: 22, open: 22.0, high: 22.1, low: 21.4, close: 21.8, volume: 1 },
  { time: 23, open: 21.8, high: 22.0, low: 21.5, close: 21.6, volume: 1 },
  { time: 24, open: 21.6, high: 21.9, low: 21.6, close: 21.8, volume: 1 },
  { time: 25, open: 21.8, high: 22.0, low: 21.7, close: 21.9, volume: 1 },
  { time: 26, open: 21.9, high: 21.95, low: 21.75, close: 21.82, volume: 1 },
  { time: 27, open: 21.82, high: 21.88, low: 21.74, close: 21.79, volume: 1 },
  { time: 28, open: 21.79, high: 21.84, low: 21.76, close: 21.8, volume: 1 },
];

assert.equal(
  detectTrianglePatterns('SOL/USDT:USDT', '5m', shortLocalTriangleCandles).length,
  0,
);

const results = detectTrianglePatterns('SOL/USDT:USDT', '5m', broadTriangleCandles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'triangle');
assert.equal(results[0].geometry.lines.length, 2);
assert.ok(results[0].geometry.pivots.length >= 6);
assert.equal(
  detectTrianglePatterns('SOL/USDT:USDT', '5m', channelCandles).length,
  0,
);
assert.equal(
  detectTrianglePatterns('SOL/USDT:USDT', '5m', microTriangleCandles).length,
  0,
);
assert.ok(
  detectTrianglePatterns('SOL/USDT:USDT', '5m', broadTriangleCandles).length > 0,
);
