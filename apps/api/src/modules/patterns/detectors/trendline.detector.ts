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

function buildRayEndpoint(
  fromTime: number,
  fromPrice: number,
  toTime: number,
  toPrice: number,
  extendMs: number,
): { time: number; price: number } {
  const targetTime = toTime + extendMs;
  const price = projectLineValueAtTime(fromTime, fromPrice, toTime, toPrice, targetTime);
  return { time: targetTime, price: price ?? toPrice };
}

function detectDescendingResistance(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  pivots: SwingPivot[],
  totalRange: number,
  minSpanBars: number,
): PatternCandidate | null {
  let best: PatternCandidate | null = null;

  for (let start = 0; start <= pivots.length - 5; start += 1) {
    for (let end = start + 4; end < Math.min(pivots.length, start + 12); end += 1) {
      const slice = pivots.slice(start, end + 1);
      if (!isAlternating(slice)) continue;

      const highs = slice.filter(pivot => pivot.kind === 'high');
      const lows = slice.filter(pivot => pivot.kind === 'low');
      if (highs.length < 3 || lows.length < 2) continue;

      const spanBars = slice[slice.length - 1]!.candleIndex - slice[0]!.candleIndex;
      if (spanBars < minSpanBars) continue;

      const descendingHighs = highs.every(
        (pivot, index) => index === 0 || pivot.price < highs[index - 1]!.price,
      );
      if (!descendingHighs) continue;

      const supportDrift = Math.abs(lows[lows.length - 1]!.price - lows[0]!.price);
      const resistanceDrop = highs[0]!.price - highs[highs.length - 1]!.price;
      if (resistanceDrop < totalRange * 0.12 || supportDrift > totalRange * 0.22) continue;

      const lineTolerance = totalRange * 0.12;
      const firstHigh = highs[0]!;
      const lastHigh = highs[highs.length - 1]!;
      const highsRespectLine = highs.every(pivot => {
        const expected = projectLineValueAtTime(
          firstHigh.time, firstHigh.price,
          lastHigh.time, lastHigh.price,
          pivot.time,
        );
        return expected != null && Math.abs(expected - pivot.price) <= lineTolerance;
      });
      if (!highsRespectLine) continue;

      const quality = clampQuality(
        58 +
        highs.length * 6 +
        lows.length * 4 +
        Math.min(12, Math.round((spanBars / candles.length) * 16)) +
        Math.min(10, Math.round((resistanceDrop / totalRange) * 12)),
      );

      const spanMs = lastHigh.time - firstHigh.time;
      const rayEnd = buildRayEndpoint(
        firstHigh.time, firstHigh.price,
        lastHigh.time, lastHigh.price,
        Math.max(spanMs * 0.4, 3 * 60_000),
      );

      const firstLow = lows[0]!;
      const lastLow = lows[lows.length - 1]!;

      // Zone: buffer band around the trendline showing the reaction area
      const zoneTolerance = totalRange * 0.035;
      const zoneFromTime = firstHigh.time;
      const zoneToTime = rayEnd.time;
      const lineAtStart = firstHigh.price;
      const lineAtEnd = rayEnd.price;

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
          priceMin: Math.min(...slice.map(p => p.price), ...candles.map(c => c.low)),
          priceMax: Math.max(...slice.map(p => p.price), ...candles.map(c => c.high)),
          pivots: slice.map(pivot => ({ time: pivot.time, price: pivot.price })),
          lines: [
            {
              kind: 'ray',
              points: [
                { time: firstHigh.time, price: firstHigh.price },
                { time: rayEnd.time, price: rayEnd.price },
              ],
            },
            {
              kind: 'segment',
              points: [
                { time: firstLow.time, price: firstLow.price },
                { time: lastLow.time, price: lastLow.price },
              ],
            },
          ],
          zones: [{
            fromTime: zoneFromTime,
            toTime: zoneToTime,
            low: Math.min(lineAtStart, lineAtEnd) - zoneTolerance,
            high: Math.max(lineAtStart, lineAtEnd) + zoneTolerance,
          }],
        },
      };

      if (!best || candidate.quality > best.quality) {
        best = candidate;
      }
    }
  }

  return best;
}

function detectAscendingSupport(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  pivots: SwingPivot[],
  totalRange: number,
  minSpanBars: number,
): PatternCandidate | null {
  let best: PatternCandidate | null = null;

  for (let start = 0; start <= pivots.length - 5; start += 1) {
    for (let end = start + 4; end < Math.min(pivots.length, start + 12); end += 1) {
      const slice = pivots.slice(start, end + 1);
      if (!isAlternating(slice)) continue;

      const highs = slice.filter(pivot => pivot.kind === 'high');
      const lows = slice.filter(pivot => pivot.kind === 'low');
      if (highs.length < 2 || lows.length < 3) continue;

      const spanBars = slice[slice.length - 1]!.candleIndex - slice[0]!.candleIndex;
      if (spanBars < minSpanBars) continue;

      const ascendingLows = lows.every(
        (pivot, index) => index === 0 || pivot.price > lows[index - 1]!.price,
      );
      if (!ascendingLows) continue;

      const resistanceDrift = Math.abs(highs[highs.length - 1]!.price - highs[0]!.price);
      const supportRise = lows[lows.length - 1]!.price - lows[0]!.price;
      if (supportRise < totalRange * 0.12 || resistanceDrift > totalRange * 0.22) continue;

      const lineTolerance = totalRange * 0.12;
      const firstLow = lows[0]!;
      const lastLow = lows[lows.length - 1]!;
      const lowsRespectLine = lows.every(pivot => {
        const expected = projectLineValueAtTime(
          firstLow.time, firstLow.price,
          lastLow.time, lastLow.price,
          pivot.time,
        );
        return expected != null && Math.abs(expected - pivot.price) <= lineTolerance;
      });
      if (!lowsRespectLine) continue;

      const quality = clampQuality(
        58 +
        lows.length * 6 +
        highs.length * 4 +
        Math.min(12, Math.round((spanBars / candles.length) * 16)) +
        Math.min(10, Math.round((supportRise / totalRange) * 12)),
      );

      const spanMs = lastLow.time - firstLow.time;
      const rayEnd = buildRayEndpoint(
        firstLow.time, firstLow.price,
        lastLow.time, lastLow.price,
        Math.max(spanMs * 0.4, 3 * 60_000),
      );

      const firstHigh = highs[0]!;
      const lastHigh = highs[highs.length - 1]!;

      // Zone: buffer band around the ascending support line
      const zoneTolerance = totalRange * 0.035;
      const lineAtStart = firstLow.price;
      const lineAtEnd = rayEnd.price;

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
          priceMin: Math.min(...slice.map(p => p.price), ...candles.map(c => c.low)),
          priceMax: Math.max(...slice.map(p => p.price), ...candles.map(c => c.high)),
          pivots: slice.map(pivot => ({ time: pivot.time, price: pivot.price })),
          lines: [
            {
              kind: 'ray',
              points: [
                { time: firstLow.time, price: firstLow.price },
                { time: rayEnd.time, price: rayEnd.price },
              ],
            },
            {
              kind: 'segment',
              points: [
                { time: firstHigh.time, price: firstHigh.price },
                { time: lastHigh.time, price: lastHigh.price },
              ],
            },
          ],
          zones: [{
            fromTime: firstLow.time,
            toTime: rayEnd.time,
            low: Math.min(lineAtStart, lineAtEnd) - zoneTolerance,
            high: Math.max(lineAtStart, lineAtEnd) + zoneTolerance,
          }],
        },
      };

      if (!best || candidate.quality > best.quality) {
        best = candidate;
      }
    }
  }

  return best;
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

  const results: PatternCandidate[] = [];

  const descending = detectDescendingResistance(symbol, timeframe, candles, pivots, totalRange, minSpanBars);
  if (descending) results.push(descending);

  const ascending = detectAscendingSupport(symbol, timeframe, candles, pivots, totalRange, minSpanBars);
  if (ascending) results.push(ascending);

  return results;
}
