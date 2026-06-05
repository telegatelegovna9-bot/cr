import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';

export function detectCascadePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) {
    return [];
  }

  const window = candles.slice(-4);
  const lows = window.map(candle => candle.low);
  const descending = lows.every((low, index) => index === 0 || low < lows[index - 1]);

  if (!descending) {
    return [];
  }

  const from = window[0].time;
  const to = window[window.length - 1].time;
  const priceMin = Math.min(...window.map(candle => candle.low));
  const priceMax = Math.max(...window.map(candle => candle.high));

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'cascade',
      status: 'confirmed',
      quality: clampQuality(70),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: window.map(candle => ({
          time: candle.time,
          price: candle.low,
        })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: window[0].time, price: window[0].low },
              { time: window[window.length - 1].time, price: window[window.length - 1].low },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
