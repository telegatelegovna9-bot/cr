import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) {
    return [];
  }

  const window = candles.slice(-4);
  const highs = window.map(candle => candle.high);
  const lows = window.map(candle => candle.low);
  const descendingHighs = highs.every((value, index) => index === 0 || value <= highs[index - 1]);
  const ascendingLows = lows.every((value, index) => index === 0 || value >= lows[index - 1]);

  if (!descendingHighs || !ascendingLows) {
    return [];
  }

  const from = window[0].time;
  const to = window[window.length - 1].time;

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'triangle',
      status: 'forming',
      quality: clampQuality(72),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin: Math.min(...lows),
        priceMax: Math.max(...highs),
        pivots: window.flatMap(candle => [
          { time: candle.time, price: candle.high },
          { time: candle.time, price: candle.low },
        ]),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: window[0].time, price: window[0].high },
              { time: window[window.length - 1].time, price: window[window.length - 1].high },
            ],
          },
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
