import assert from 'node:assert/strict';
import type { PatternCandidate } from './detector.types';
import type { PatternTimeframe } from '../patterns.types';
import { scanDetectorAcrossWindows } from './detector.utils';

const candles = Array.from({ length: 40 }, (_, index) => ({
  time: index + 1,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 1,
}));

const calls: Array<{ from: number; to: number }> = [];

function fakeDetector(
  symbol: string,
  timeframe: PatternTimeframe,
  input: typeof candles,
): PatternCandidate[] {
  calls.push({
    from: input[0]?.time ?? 0,
    to: input[input.length - 1]?.time ?? 0,
  });

  const first = input[0];
  const last = input[input.length - 1];
  if (!first || !last) return [];

  if (input.length >= 24 && first.time >= 9) {
    return [
      {
        id: 'best-window',
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality: 88,
        from: first.time,
        to: last.time,
        geometry: {
          anchorTimeFrom: first.time,
          anchorTimeTo: last.time,
          priceMin: Math.min(...input.map(item => item.low)),
          priceMax: Math.max(...input.map(item => item.high)),
          pivots: [
            { time: first.time, price: first.high },
            { time: last.time, price: last.high },
          ],
          lines: [
            {
              kind: 'segment',
              points: [
                { time: first.time, price: first.high },
                { time: last.time, price: last.high },
              ],
            },
          ],
          zones: [],
        },
      },
    ];
  }

  return [];
}

const results = scanDetectorAcrossWindows(
  'BTC/USDT:USDT',
  '15m',
  candles,
  fakeDetector,
);

assert.ok(calls.length > 1);
assert.ok(results.length >= 1);
assert.equal(results[0].id, 'best-window');
