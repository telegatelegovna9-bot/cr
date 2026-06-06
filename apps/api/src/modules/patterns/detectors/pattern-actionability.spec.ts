import assert from 'node:assert/strict';
import { refinePatternActionability } from './pattern-actionability';
import type { PatternCandidate } from './detector.types';

const triangleCandles = [
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
];

const activeTriangle: PatternCandidate = {
  id: 'triangle-active',
  exchange: 'binance',
  marketType: 'futures',
  symbol: 'SOL/USDT:USDT',
  timeframe: '5m',
  kind: 'triangle',
  status: 'forming',
  quality: 78,
  from: 3,
  to: 15,
  geometry: {
    anchorTimeFrom: 3,
    anchorTimeTo: 15,
    priceMin: 18.1,
    priceMax: 24.9,
    pivots: [
      { time: 3, price: 18.1 },
      { time: 5, price: 24.9 },
      { time: 7, price: 18.9 },
      { time: 9, price: 24.2 },
      { time: 11, price: 19.7 },
      { time: 13, price: 23.6 },
      { time: 15, price: 20.5 },
    ],
    lines: [
      { kind: 'segment', points: [{ time: 5, price: 24.9 }, { time: 13, price: 23.6 }] },
      { kind: 'segment', points: [{ time: 3, price: 18.1 }, { time: 15, price: 20.5 }] },
    ],
    zones: [],
  },
};

const staleTriangle: PatternCandidate = {
  ...activeTriangle,
  id: 'triangle-stale',
  geometry: {
    ...activeTriangle.geometry,
    anchorTimeTo: 8,
    lines: [
      { kind: 'segment', points: [{ time: 5, price: 24.9 }, { time: 8, price: 24.2 }] },
      { kind: 'segment', points: [{ time: 3, price: 18.1 }, { time: 8, price: 19.2 }] },
    ],
  },
  to: 8,
};

assert.equal(refinePatternActionability(activeTriangle, triangleCandles, '5m').keep, true);
assert.equal(refinePatternActionability(staleTriangle, triangleCandles, '5m').keep, false);

const trendlineCandles = Array.from({ length: 28 }, (_, index) => {
  const phase = index % 4;
  const resistanceBase = 18 - index * 0.12;
  const supportBase = 14.4 + index * 0.025;
  if (phase === 0) return { time: index + 1, open: supportBase + 0.5, high: resistanceBase + 0.45, low: supportBase + 0.15, close: resistanceBase + 0.2, volume: 1 };
  if (phase === 1) return { time: index + 1, open: resistanceBase + 0.15, high: resistanceBase + 0.22, low: supportBase + 0.18, close: supportBase + 0.32, volume: 1 };
  if (phase === 2) return { time: index + 1, open: supportBase + 0.35, high: resistanceBase + 0.08, low: supportBase + 0.22, close: resistanceBase - 0.02, volume: 1 };
  return { time: index + 1, open: resistanceBase, high: resistanceBase + 0.06, low: supportBase + 0.05, close: supportBase + 0.2, volume: 1 };
});

const activeTrendline: PatternCandidate = {
  id: 'trendline-active',
  exchange: 'binance',
  marketType: 'futures',
  symbol: 'ETH/USDT:USDT',
  timeframe: '1h',
  kind: 'trendline',
  status: 'forming',
  quality: 82,
  from: 4,
  to: 24,
  geometry: {
    anchorTimeFrom: 4,
    anchorTimeTo: 24,
    priceMin: 14.52,
    priceMax: 18.45,
    pivots: [
      { time: 4, price: 14.52 },
      { time: 5, price: 17.97 },
      { time: 8, price: 14.62 },
      { time: 9, price: 17.49 },
      { time: 12, price: 14.72 },
      { time: 13, price: 17.01 },
      { time: 16, price: 14.82 },
      { time: 17, price: 16.53 },
      { time: 20, price: 14.92 },
      { time: 21, price: 16.05 },
      { time: 24, price: 15.02 },
    ],
    lines: [
      { kind: 'segment', points: [{ time: 5, price: 17.97 }, { time: 21, price: 16.05 }] },
    ],
    zones: [],
  },
};

const staleTrendline: PatternCandidate = {
  ...activeTrendline,
  id: 'trendline-stale',
  to: 13,
  geometry: {
    ...activeTrendline.geometry,
    anchorTimeTo: 13,
    lines: [{ kind: 'segment', points: [{ time: 5, price: 17.97 }, { time: 13, price: 17.01 }] }],
  },
};

assert.equal(refinePatternActionability(activeTrendline, trendlineCandles, '1h').keep, true);
assert.equal(refinePatternActionability(staleTrendline, trendlineCandles, '1h').keep, false);
