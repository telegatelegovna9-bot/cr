import assert from 'node:assert/strict';
import { refinePatternActionability } from './pattern-actionability';
import type { PatternCandidate } from './detector.types';

const candles = [
  { time: 1, open: 98, high: 100, low: 97, close: 99, volume: 100 },
  { time: 2, open: 99, high: 101, low: 98, close: 100, volume: 110 },
  { time: 3, open: 100, high: 102, low: 99, close: 101, volume: 120 },
  { time: 4, open: 101, high: 103, low: 100, close: 102, volume: 130 },
  { time: 5, open: 102, high: 104, low: 101, close: 103, volume: 140 },
  { time: 6, open: 103, high: 105, low: 102, close: 104, volume: 150 },
  { time: 7, open: 104, high: 106, low: 103, close: 105, volume: 160 },
  { time: 8, open: 105, high: 107, low: 104, close: 106, volume: 170 },
];

function buildCandidate(kind: PatternCandidate['kind'], anchorTimeTo: number, level = 104): PatternCandidate {
  return {
    id: `${kind}-1`,
    exchange: 'binance',
    marketType: 'futures',
    symbol: 'BTC/USDT:USDT',
    timeframe: '15m',
    kind,
    status: 'confirmed',
    quality: 70,
    from: 2,
    to: anchorTimeTo,
    geometry: {
      anchorTimeFrom: 2,
      anchorTimeTo,
      priceMin: 98,
      priceMax: 107,
      pivots: [
        { time: 2, price: level },
        { time: anchorTimeTo, price: candles.find(candle => candle.time === anchorTimeTo)?.close ?? level },
      ],
      lines: [
        {
          kind: 'segment',
          points: [
            { time: 2, price: level },
            { time: anchorTimeTo, price: level },
          ],
        },
      ],
      zones: [],
    },
  };
}

assert.equal(refinePatternActionability(buildCandidate('breakout', 7), candles, '15m').keep, true);
assert.equal(refinePatternActionability(buildCandidate('retest', 7, 104.5), candles, '15m').keep, true);
assert.equal(refinePatternActionability(buildCandidate('structure_break', 7), candles, '15m').keep, true);

const staleBreakout = buildCandidate('breakout', 2);
assert.equal(refinePatternActionability(staleBreakout, candles, '15m').keep, false);

const farSweep = buildCandidate('liquidity_sweep', 7, 90);
assert.equal(refinePatternActionability(farSweep, candles, '15m').keep, false);
