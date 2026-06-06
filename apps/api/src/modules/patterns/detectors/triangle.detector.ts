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

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 24) {
    return [];
  }

  const pivots = extractSwingPivots(candles);
  if (pivots.length < 6) {
    return [];
  }

  const priceMin = Math.min(...candles.map(candle => candle.low));
  const priceMax = Math.max(...candles.map(candle => candle.high));
  const totalRange = Math.max(priceMax - priceMin, 1e-10);
  const minSpanBars = Math.max(12, Math.floor(candles.length * 0.4));
  let best: PatternCandidate | null = null;

  const isAlternating = (slice: SwingPivot[]) =>
    slice.every((pivot, index) => index === 0 || pivot.kind !== slice[index - 1]?.kind);

  for (let start = 0; start <= pivots.length - 6; start += 1) {
    for (let end = start + 5; end < Math.min(pivots.length, start + 12); end += 1) {
      const slice = pivots.slice(start, end + 1);
      if (!isAlternating(slice)) {
        continue;
      }

      const highs = slice.filter(pivot => pivot.kind === 'high');
      const lows = slice.filter(pivot => pivot.kind === 'low');
      if (highs.length < 3 || lows.length < 3) {
        continue;
      }

      const spanBars = slice[slice.length - 1]!.candleIndex - slice[0]!.candleIndex;
      if (spanBars < minSpanBars) {
        continue;
      }

      const descendingHighs = highs.every(
        (pivot, index) => index === 0 || pivot.price < highs[index - 1]!.price,
      );
      const ascendingLows = lows.every(
        (pivot, index) => index === 0 || pivot.price > lows[index - 1]!.price,
      );

      if (!descendingHighs || !ascendingLows) {
        continue;
      }

      const widthStart = highs[0]!.price - lows[0]!.price;
      const widthEnd = highs[highs.length - 1]!.price - lows[lows.length - 1]!.price;
      if (
        widthStart <= totalRange * 0.2 ||
        widthEnd <= 0 ||
        widthEnd >= widthStart * 0.55
      ) {
        continue;
      }

      const upperLineTolerance = totalRange * 0.08;
      const lowerLineTolerance = totalRange * 0.08;
      const firstHigh = highs[0]!;
      const lastHigh = highs[highs.length - 1]!;
      const firstLow = lows[0]!;
      const lastLow = lows[lows.length - 1]!;
      const highsFit = highs.every(pivot => {
        const expected = projectLineValueAtTime(
          firstHigh.time,
          firstHigh.price,
          lastHigh.time,
          lastHigh.price,
          pivot.time,
        );
        return expected != null && Math.abs(expected - pivot.price) <= upperLineTolerance;
      });
      const lowsFit = lows.every(pivot => {
        const expected = projectLineValueAtTime(
          firstLow.time,
          firstLow.price,
          lastLow.time,
          lastLow.price,
          pivot.time,
        );
        return expected != null && Math.abs(expected - pivot.price) <= lowerLineTolerance;
      });

      if (!highsFit || !lowsFit) {
        continue;
      }

      const spanTime = slice[slice.length - 1]!.time - slice[0]!.time;
      const probeTime = slice[slice.length - 1]!.time + spanTime;
      const upperAtProbe = projectLineValueAtTime(
        firstHigh.time,
        firstHigh.price,
        lastHigh.time,
        lastHigh.price,
        probeTime,
      );
      const lowerAtProbe = projectLineValueAtTime(
        firstLow.time,
        firstLow.price,
        lastLow.time,
        lastLow.price,
        probeTime,
      );

      if (upperAtProbe == null || lowerAtProbe == null || upperAtProbe <= lowerAtProbe) {
        continue;
      }

      const quality = clampQuality(
        60 +
          highs.length * 5 +
          lows.length * 5 +
          Math.min(14, Math.round((spanBars / candles.length) * 18)) +
          Math.min(10, Math.round(((widthStart - widthEnd) / widthStart) * 12)),
      );

      // Apex zone: last 30% of the triangle span where breakout is expected
      const apexStart = slice[0]!.time + Math.floor((slice[slice.length - 1]!.time - slice[0]!.time) * 0.7);
      const apexEnd = slice[slice.length - 1]!.time;
      const upperAtApexStart = projectLineValueAtTime(firstHigh.time, firstHigh.price, lastHigh.time, lastHigh.price, apexStart);
      const lowerAtApexStart = projectLineValueAtTime(firstLow.time, firstLow.price, lastLow.time, lastLow.price, apexStart);
      const upperAtApexEnd = projectLineValueAtTime(firstHigh.time, firstHigh.price, lastHigh.time, lastHigh.price, apexEnd);
      const lowerAtApexEnd = projectLineValueAtTime(firstLow.time, firstLow.price, lastLow.time, lastLow.price, apexEnd);

      const apexZones =
        upperAtApexStart != null && lowerAtApexStart != null &&
        upperAtApexEnd != null && lowerAtApexEnd != null
          ? [{
              fromTime: apexStart,
              toTime: apexEnd,
              low: Math.min(lowerAtApexStart, lowerAtApexEnd),
              high: Math.max(upperAtApexStart, upperAtApexEnd),
            }]
          : [];

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'triangle',
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
            {
              kind: 'segment',
              points: [
                { time: firstLow.time, price: firstLow.price },
                { time: lastLow.time, price: lastLow.price },
              ],
            },
          ],
          zones: apexZones,
        },
      };

      if (!best || candidate.quality > best.quality) {
        best = candidate;
      }
    }
  }

  return best ? [best] : [];
}
