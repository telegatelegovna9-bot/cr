import assert from 'node:assert/strict';
import { detectCascadePatterns } from './cascade.detector';

const candles = [
  { time: 1, open: 10, high: 11, low: 9.8, close: 10.7, volume: 1 },
  { time: 2, open: 10.7, high: 11.2, low: 10.1, close: 10.3, volume: 1 },
  { time: 3, open: 10.3, high: 10.5, low: 9.7, close: 9.9, volume: 1 },
  { time: 4, open: 9.9, high: 10.2, low: 9.4, close: 9.7, volume: 1 },
  { time: 5, open: 9.7, high: 9.9, low: 9.2, close: 9.3, volume: 1 },
  { time: 6, open: 9.3, high: 9.6, low: 8.9, close: 9.0, volume: 1 },
];

const results = detectCascadePatterns('BTC/USDT:USDT', '15m', candles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'cascade');
assert.ok(results[0].quality >= 55);
