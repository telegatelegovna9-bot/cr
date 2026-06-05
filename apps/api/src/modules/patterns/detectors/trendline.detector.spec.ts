import assert from 'node:assert/strict';
import { detectTrendlinePatterns } from './trendline.detector';

const validTrendlineCandles = [
  { time: 1, open: 10.2, high: 11.4, low: 10.0, close: 11.1, volume: 1 },
  { time: 2, open: 11.1, high: 11.0, low: 10.3, close: 10.55, volume: 1 },
  { time: 3, open: 10.55, high: 10.95, low: 10.45, close: 10.82, volume: 1 },
  { time: 4, open: 10.82, high: 10.84, low: 10.08, close: 10.22, volume: 1 },
  { time: 5, open: 10.22, high: 10.65, low: 10.12, close: 10.48, volume: 1 },
  { time: 6, open: 10.48, high: 10.5, low: 9.9, close: 10.0, volume: 1 },
  { time: 7, open: 10.0, high: 10.32, low: 9.96, close: 10.23, volume: 1 },
  { time: 8, open: 10.23, high: 10.24, low: 9.72, close: 9.85, volume: 1 },
];

const noiseCandles = [
  { time: 1, open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 1 },
  { time: 2, open: 10.2, high: 10.7, low: 10.0, close: 10.6, volume: 1 },
  { time: 3, open: 10.6, high: 10.8, low: 10.2, close: 10.3, volume: 1 },
  { time: 4, open: 10.3, high: 10.9, low: 10.15, close: 10.75, volume: 1 },
  { time: 5, open: 10.75, high: 10.95, low: 10.4, close: 10.5, volume: 1 },
  { time: 6, open: 10.5, high: 10.98, low: 10.35, close: 10.9, volume: 1 },
  { time: 7, open: 10.9, high: 11.05, low: 10.7, close: 10.82, volume: 1 },
  { time: 8, open: 10.82, high: 11.1, low: 10.6, close: 10.95, volume: 1 },
];

const results = detectTrendlinePatterns('ETH/USDT:USDT', '1h', validTrendlineCandles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'trendline');
assert.ok(results[0].status === 'forming' || results[0].status === 'confirmed');
assert.ok(results[0].geometry.lines.length >= 1);
assert.ok(results[0].geometry.pivots.length >= 3);
assert.equal(
  detectTrendlinePatterns('ETH/USDT:USDT', '1h', noiseCandles).length,
  0,
);
