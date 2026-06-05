import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality, extractSwingPivots } from './detector.utils';

function projectLineValueAtTime(
  fromTime: number,
  fromPrice: number,
  toTime: number,
  toPrice: number,
  targetTime: number,
): number | null {
  const deltaTime = toTime - fromTime;
  if (deltaTime === 0) return null;
  const slope = (toPrice - fromPrice) / deltaTime;
  return fromPrice + slope * (targetTime - fromTime);
}

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 8) {
    return [];
  }

  const window = candles.slice(-14);
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

  const descendingHighs = highs.every((value, index) => index === 0 || value.price < highs[index - 1].price);
  const ascendingLows = lows.every((value, index) => index === 0 || value.price > lows[index - 1].price);
  const widthStart = highs[0].price - lows[0].price;
  const widthEnd = highs[highs.length - 1].price - lows[lows.length - 1].price;
  const narrowing = widthEnd > 0 && widthEnd < widthStart * 0.65;
  const highDrop = highs[0].price - highs[highs.length - 1].price;
  const lowRise = lows[lows.length - 1].price - lows[0].price;
  const balancedCompression =
    widthStart > 0 &&
    highDrop / widthStart > 0.15 &&
    lowRise / widthStart > 0.12;
  const span = highs[highs.length - 1].time - highs[0].time;
  const futureProbeTime = highs[highs.length - 1].time + span;
  const upperAtProbe = projectLineValueAtTime(
    highs[0].time,
    highs[0].price,
    highs[highs.length - 1].time,
    highs[highs.length - 1].price,
    futureProbeTime,
  );
  const lowerAtProbe = projectLineValueAtTime(
    lows[0].time,
    lows[0].price,
    lows[lows.length - 1].time,
    lows[lows.length - 1].price,
    futureProbeTime,
  );
  const convergesSoon =
    upperAtProbe != null &&
    lowerAtProbe != null &&
    upperAtProbe <= lowerAtProbe;

  if (!descendingHighs || !ascendingLows || !narrowing || !balancedCompression || !convergesSoon) {
    return [];
  }

  const from = lastSix[0].time;
  const to = lastSix[lastSix.length - 1].time;
  const quality = clampQuality(72 + Math.min(10, narrowing ? 6 : 0));

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'triangle',
      status: 'forming',
      quality,
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin: Math.min(...lows.map(pivot => pivot.price)),
        priceMax: Math.max(...highs.map(pivot => pivot.price)),
        pivots: lastSix.map(pivot => ({ time: pivot.time, price: pivot.price })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: highs[0].time, price: highs[0].price },
              { time: highs[highs.length - 1].time, price: highs[highs.length - 1].price },
            ],
          },
          {
            kind: 'segment',
            points: [
              { time: lows[0].time, price: lows[0].price },
              { time: lows[lows.length - 1].time, price: lows[lows.length - 1].price },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
