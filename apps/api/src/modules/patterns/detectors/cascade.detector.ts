import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality, extractSwingPivots } from './detector.utils';

export function detectCascadePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 8) {
    return [];
  }

  const window = candles.slice(-12);
  const pivots = extractSwingPivots(window);
  if (pivots.length < 6) {
    return [];
  }

  const lastSix = pivots.slice(-6);
  const alternating = lastSix.every((pivot, index) =>
    index === 0 ? pivot.kind === 'high' : pivot.kind !== lastSix[index - 1]?.kind,
  );

  if (!alternating) {
    return [];
  }

  const highs = lastSix.filter(pivot => pivot.kind === 'high');
  const lows = lastSix.filter(pivot => pivot.kind === 'low');
  if (highs.length < 3 || lows.length < 3) {
    return [];
  }

  const descendingHighs = highs.every(
    (pivot, index) => index === 0 || pivot.price < highs[index - 1].price,
  );
  const descendingLows = lows.every(
    (pivot, index) => index === 0 || pivot.price < lows[index - 1].price,
  );

  if (!descendingHighs || !descendingLows) {
    return [];
  }

  const impulses = [
    highs[0].price - lows[0].price,
    highs[1].price - lows[1].price,
    highs[2].price - lows[2].price,
  ];
  const minimumImpulse = Math.max(...impulses) * 0.28;
  const validImpulseStructure = impulses.every(value => value > minimumImpulse);
  if (!validImpulseStructure) {
    return [];
  }

  const lastCandle = window[window.length - 1];
  const confirmed = lastCandle.close <= lows[lows.length - 1].price * 1.002;
  const from = lastSix[0].time;
  const to = lastSix[lastSix.length - 1].time;
  const priceValues = lastSix.map(pivot => pivot.price);
  const priceMin = Math.min(...priceValues, ...window.map(candle => candle.low));
  const priceMax = Math.max(...priceValues, ...window.map(candle => candle.high));
  const stairLines = lastSix.slice(0, -1).map((pivot, index) => ({
    kind: 'segment' as const,
    points: [
      { time: pivot.time, price: pivot.price },
      { time: lastSix[index + 1].time, price: lastSix[index + 1].price },
    ] as [{ time: number; price: number }, { time: number; price: number }],
  }));

  const quality =
    64 +
    Math.min(12, (highs[0].price - highs[2].price) > 0 ? 4 : 0) +
    Math.min(10, (lows[0].price - lows[2].price) > 0 ? 4 : 0) +
    (confirmed ? 8 : 0);

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'cascade',
      status: confirmed ? 'confirmed' : 'forming',
      quality: clampQuality(quality),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: lastSix.map(pivot => ({
          time: pivot.time,
          price: pivot.price,
        })),
        lines: stairLines,
        zones: [],
      },
    },
  ];
}
