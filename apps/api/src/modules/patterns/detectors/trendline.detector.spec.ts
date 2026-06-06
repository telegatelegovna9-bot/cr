import assert from 'node:assert/strict';
import { detectTrendlinePatterns } from './trendline.detector';

const shortLocalTrendlineCandles = [
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

const microTrendlineCandles = [
  ...Array.from({ length: 20 }, (_, index) => ({
    time: index + 1,
    open: 15 + (index % 3) * 0.08,
    high: 15.4 + (index % 4) * 0.06,
    low: 14.7 - (index % 2) * 0.05,
    close: 15 + ((index + 1) % 3) * 0.03,
    volume: 1,
  })),
  { time: 21, open: 15.2, high: 16.5, low: 15.05, close: 16.2, volume: 1 },
  { time: 22, open: 16.2, high: 16.18, low: 15.35, close: 15.52, volume: 1 },
  { time: 23, open: 15.52, high: 15.96, low: 15.42, close: 15.84, volume: 1 },
  { time: 24, open: 15.84, high: 15.86, low: 15.0, close: 15.12, volume: 1 },
  { time: 25, open: 15.12, high: 15.6, low: 15.04, close: 15.45, volume: 1 },
  { time: 26, open: 15.45, high: 15.47, low: 14.82, close: 14.95, volume: 1 },
  { time: 27, open: 14.95, high: 15.2, low: 14.9, close: 15.08, volume: 1 },
  { time: 28, open: 15.08, high: 15.1, low: 14.62, close: 14.75, volume: 1 },
];

const broadTrendlineCandles = Array.from({ length: 28 }, (_, index) => {
  const phase = index % 4;
  const resistanceBase = 18 - index * 0.12;
  const supportBase = 14.4 + index * 0.025;
  if (phase === 0) {
    return {
      time: index + 1,
      open: supportBase + 0.5,
      high: resistanceBase + 0.45,
      low: supportBase + 0.15,
      close: resistanceBase + 0.2,
      volume: 1,
    };
  }

  if (phase === 1) {
    return {
      time: index + 1,
      open: resistanceBase + 0.15,
      high: resistanceBase + 0.22,
      low: supportBase + 0.18,
      close: supportBase + 0.32,
      volume: 1,
    };
  }

  if (phase === 2) {
    return {
      time: index + 1,
      open: supportBase + 0.35,
      high: resistanceBase + 0.08,
      low: supportBase + 0.22,
      close: resistanceBase - 0.02,
      volume: 1,
    };
  }

  return {
    time: index + 1,
    open: resistanceBase,
    high: resistanceBase + 0.06,
    low: supportBase + 0.05,
    close: supportBase + 0.2,
    volume: 1,
  };
});

assert.equal(
  detectTrendlinePatterns('ETH/USDT:USDT', '1h', shortLocalTrendlineCandles).length,
  0,
);

const results = detectTrendlinePatterns('ETH/USDT:USDT', '1h', broadTrendlineCandles);

assert.ok(results.length > 0);
assert.equal(results[0].kind, 'trendline');
assert.ok(results[0].status === 'forming' || results[0].status === 'confirmed');
assert.ok(results[0].geometry.lines.length >= 1);
assert.ok(results[0].geometry.pivots.length >= 3);
assert.equal(
  detectTrendlinePatterns('ETH/USDT:USDT', '1h', noiseCandles).length,
  0,
);
assert.equal(
  detectTrendlinePatterns('ETH/USDT:USDT', '1h', microTrendlineCandles).length,
  0,
);
assert.ok(
  detectTrendlinePatterns('ETH/USDT:USDT', '1h', broadTrendlineCandles).length > 0,
);
