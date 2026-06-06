import assert from 'node:assert/strict';
import { detectCascadePatterns } from './cascade.detector';

const staircaseCandles = [
  { time: 1, open: 10.0, high: 11.0, low: 9.85, close: 10.8, volume: 1 },
  { time: 2, open: 10.8, high: 10.85, low: 10.05, close: 10.2, volume: 1 },
  { time: 3, open: 10.2, high: 10.65, low: 10.0, close: 10.48, volume: 1 },
  { time: 4, open: 10.48, high: 10.5, low: 9.42, close: 9.68, volume: 1 },
  { time: 5, open: 9.68, high: 10.08, low: 9.54, close: 9.94, volume: 1 },
  { time: 6, open: 9.94, high: 9.96, low: 8.96, close: 9.22, volume: 1 },
  { time: 7, open: 9.22, high: 9.62, low: 9.12, close: 9.48, volume: 1 },
  { time: 8, open: 9.48, high: 9.5, low: 8.56, close: 8.78, volume: 1 },
  { time: 9, open: 8.78, high: 9.18, low: 8.66, close: 9.02, volume: 1 },
  { time: 10, open: 9.02, high: 9.06, low: 8.2, close: 8.36, volume: 1 },
  { time: 11, open: 8.36, high: 8.7, low: 8.3, close: 8.58, volume: 1 },
  { time: 12, open: 8.58, high: 8.6, low: 7.92, close: 8.02, volume: 1 },
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

assert.equal(
  detectCascadePatterns('BTC/USDT:USDT', '15m', staircaseCandles).length,
  0,
);
assert.equal(
  detectCascadePatterns('BTC/USDT:USDT', '15m', straightDownCandles).length,
  0,
);
