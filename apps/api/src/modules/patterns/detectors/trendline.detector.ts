import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality, extractSwingPivots, type SwingPivot } from './detector.utils';

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

function isAlternating(pivots: SwingPivot[]): boolean {
  return pivots.every((pivot, index) => index === 0 || pivot.kind !== pivots[index - 1]?.kind);
}

export function detectTrendlinePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 24) {
    return [];
  }

  const pivots = extractSwingPivots(candles);
  if (pivots.length < 5) {
    return [];
  }

  const priceMin = Math.min(...candles.map(candle => candle.low));
  const priceMax = Math.max(...candles.map(candle => candle.high));
  const totalRange = Math.max(priceMax - priceMin, 1e-10);
  const minSpanBars = Math.max(12, Math.floor(candles.length * 0.35));
  let best: PatternCandidate | null = null;

  for (let start = 0; start <= pivots.length - 5; start += 1) {
    for (let end = start + 4; end < Math.min(pivots.length, start + 12); end += 1) {
      const slice = pivots.slice(start, end + 1);
      if (!isAlternating(slice)) {
        continue;
      }

      const highs = slice.filter(pivot => pivot.kind === 'high');
      const lows = slice.filter(pivot => pivot.kind === 'low');
      if (highs.length < 3 || lows.length < 2) {
        continue;
      }

      const spanBars = slice[slice.length - 1]!.candleIndex - slice[0]!.candleIndex;
      if (spanBars < minSpanBars) {
        continue;
      }

      const descendingHighs = highs.every(
        (pivot, index) => index === 0 || pivot.price < highs[index - 1]!.price,
      );
      if (!descendingHighs) {
        continue;
      }

      const supportDrift = Math.abs(lows[lows.length - 1]!.price - lows[0]!.price);
      const resistanceDrop = highs[0]!.price - highs[highs.length - 1]!.price;
      if (resistanceDrop < totalRange * 0.12 || supportDrift > totalRange * 0.18) {
        continue;
      }

      const lineTolerance = totalRange * 0.12;
      const firstHigh = highs[0]!;
      const lastHigh = highs[highs.length - 1]!;
      const highsRespectLine = highs.every(pivot => {
        const expected = projectLineValueAtTime(
          firstHigh.time,
          firstHigh.price,
          lastHigh.time,
          lastHigh.price,
          pivot.time,
        );
        return expected != null && Math.abs(expected - pivot.price) <= lineTolerance;
      });

      if (!highsRespectLine) {
        continue;
      }

      const quality = clampQuality(
        58 +
          highs.length * 6 +
          lows.length * 4 +
          Math.min(12, Math.round((spanBars / candles.length) * 16)) +
          Math.min(10, Math.round((resistanceDrop / totalRange) * 12)),
      );

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality,
        from: slice[0]!.time,
        to: slice[slice.length - 1]!.time,
        geometry: {
          anchorTimeFrom: slice[0]!.time,
          anchorTimeTo: slice[slice.length - 1]!.time,
          priceMin: Math.min(...slice.map(pivot => pivot.price), ...candles.map(candle => candle.low)),
          priceMax: Math.max(...slice.map(pivot => pivot.price), ...candles.map(candle => candle.high)),
          pivots: slice.map(pivot => ({ time: pivot.time, price: pivot.price })),
          lines: [
            {
              kind: 'segment',
              points: [
                { time: firstHigh.time, price: firstHigh.price },
                { time: lastHigh.time, price: lastHigh.price },
              ],
            },
          ],
          zones: [],
        },
      };

      if (!best || candidate.quality > best.quality) {
        best = candidate;
      }
    }
  }

  return best ? [best] : [];
}
