import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality, extractSwingPivots } from './detector.utils';

export function detectTrendlinePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 8) {
    return [];
  }

  const window = candles.slice(-12);
  const pivots = extractSwingPivots(window);
  if (pivots.length < 5) {
    return [];
  }

  let lastFive = pivots.slice(-5);
  if (lastFive[0]?.kind !== 'high' && pivots.length >= 6) {
    lastFive = pivots.slice(-6, -1);
  }
  const alternating = lastFive.every((pivot, index) =>
    index === 0 ? pivot.kind === 'high' : pivot.kind !== lastFive[index - 1]?.kind,
  );

  if (!alternating) {
    return [];
  }

  const highs = lastFive.filter(pivot => pivot.kind === 'high');
  const lows = lastFive.filter(pivot => pivot.kind === 'low');
  if (highs.length < 3 || lows.length < 2) {
    return [];
  }

  const descendingHighs = highs.every(
    (pivot, index) => index === 0 || pivot.price < highs[index - 1].price,
  );
  const lowsHolding = lows.every(
    (pivot, index) => index === 0 || pivot.price >= lows[index - 1].price * 0.97,
  );
  const resistanceDrop = highs[0].price - highs[highs.length - 1].price;
  const supportDrift = Math.abs(lows[lows.length - 1].price - lows[0].price);
  const cleanSlope = resistanceDrop > 0 && supportDrift <= resistanceDrop * 0.55;

  if (!descendingHighs || !lowsHolding || !cleanSlope) {
    return [];
  }

  const from = lastFive[0].time;
  const to = lastFive[lastFive.length - 1].time;
  const priceMin = Math.min(...window.map(candle => candle.low), ...lastFive.map(pivot => pivot.price));
  const priceMax = Math.max(...window.map(candle => candle.high), ...lastFive.map(pivot => pivot.price));
  const quality = clampQuality(68 + Math.min(10, resistanceDrop > 0 ? 6 : 0));

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'trendline',
      status: 'forming',
      quality,
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: lastFive.map(pivot => ({
          time: pivot.time,
          price: pivot.price,
        })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: highs[0].time, price: highs[0].price },
              { time: highs[highs.length - 1].time, price: highs[highs.length - 1].price },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
