import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';

export function detectTrendlinePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) {
    return [];
  }

  const window = candles.slice(-4);
  const highs = window.map(candle => candle.high);
  const descending = highs.every((high, index) => index === 0 || high <= highs[index - 1]);

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
      kind: 'trendline',
      status: 'forming',
      quality: clampQuality(66),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: window.map(candle => ({
          time: candle.time,
          price: candle.high,
        })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: window[0].time, price: window[0].high },
              { time: window[window.length - 1].time, price: window[window.length - 1].high },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
