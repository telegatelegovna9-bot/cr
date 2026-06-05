import assert from 'node:assert/strict';
import { detectTrendlinePatterns } from './trendline.detector';

const candles = [
  { time: 1, open: 10, high: 11.5, low: 9.9, close: 11.1, volume: 1 },
  { time: 2, open: 11.1, high: 11.3, low: 10.2, close: 10.8, volume: 1 },
  { time: 3, open: 10.8, high: 11.0, low: 10.0, close: 10.6, volume: 1 },
  { time: 4, open: 10.6, high: 10.8, low: 10.1, close: 10.4, volume: 1 },
  { time: 5, open: 10.4, high: 10.6, low: 10.0, close: 10.3, volume: 1 },
  { time: 6, open: 10.3, high: 10.5, low: 9.95, close: 10.1, volume: 1 },
];

const results = detectTrendlinePatterns('ETH/USDT:USDT', '1h', candles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'trendline');
assert.ok(results[0].status === 'forming' || results[0].status === 'confirmed');
