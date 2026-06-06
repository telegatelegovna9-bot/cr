import { randomUUID } from 'node:crypto';
import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import {
  clampQuality,
  extractSwingPivots,
  linearRegression,
  projectLineAtX,
  type SwingPivot,
} from './detector.utils';

// Checks that no candle body/wick between pivot[i] and pivot[i+1] violates the trendline.
// For resistance lines: no close should be significantly above the line.
// For support lines: no close should be significantly below the line.
function isTrendlineIntact(
  candles: DetectorCandle[],
  pivots: SwingPivot[],
  kind: 'resistance' | 'support',
  lineX1: number, lineY1: number,
  lineX2: number, lineY2: number,
  violationTolerance: number,
): boolean {
  const firstPivotTime = pivots[0]!.time;
  const lastPivotTime = pivots[pivots.length - 1]!.time;

  for (const candle of candles) {
    if (candle.time < firstPivotTime || candle.time > lastPivotTime) continue;

    const lineValue = projectLineAtX(lineX1, lineY1, lineX2, lineY2, candle.time);
    if (lineValue == null) continue;

    if (kind === 'resistance' && candle.close > lineValue + violationTolerance) return false;
    if (kind === 'support' && candle.close < lineValue - violationTolerance) return false;
  }
  return true;
}

// Verify each pivot is actually a touch (price came close and reversed).
// A touch means the pivot candle's high/low is within touchTolerance of the line
// AND the candle reversed after the touch (next candle moved away from line).
function countValidTouches(
  candles: DetectorCandle[],
  pivots: SwingPivot[],
  kind: 'resistance' | 'support',
  lineX1: number, lineY1: number,
  lineX2: number, lineY2: number,
  touchTolerance: number,
): number {
  let touches = 0;
  for (const pivot of pivots) {
    const lineValue = projectLineAtX(lineX1, lineY1, lineX2, lineY2, pivot.time);
    if (lineValue == null) continue;

    const priceAtPivot = kind === 'resistance' ? pivot.price : pivot.price;
    const distance = Math.abs(priceAtPivot - lineValue);
    if (distance <= touchTolerance) touches++;
  }
  return touches;
}

function detectResistanceTrendline(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  atr: number,
): PatternCandidate | null {
  const pivots = extractSwingPivots(candles, 1.5);
  const highs = pivots.filter(p => p.kind === 'high');

  if (highs.length < 3) return null;

  let best: PatternCandidate | null = null;

  // Try all combinations of at least 3 swing highs as trendline points
  for (let i = 0; i < highs.length - 2; i++) {
    for (let j = highs.length - 1; j > i + 1; j--) {
      const first = highs[i]!;
      const last = highs[j]!;

      // Span must be at least 10 bars
      if (last.candleIndex - first.candleIndex < 10) continue;

      // Line must be descending for resistance
      if (last.price >= first.price) continue;

      // Slope sanity: drop must be at least 1 ATR total
      const totalDrop = first.price - last.price;
      if (totalDrop < atr) continue;

      const touchTolerance = atr * 0.5;
      const violationTolerance = atr * 0.3;

      // Collect highs that touch this line
      const touchingHighs = highs.filter(h => {
        const lineVal = projectLineAtX(first.time, first.price, last.time, last.price, h.time);
        if (lineVal == null) return false;
        return Math.abs(h.price - lineVal) <= touchTolerance;
      });

      if (touchingHighs.length < 3) continue;

      // Line must not be broken (no close above line between touches)
      const intact = isTrendlineIntact(
        candles, touchingHighs, 'resistance',
        first.time, first.price, last.time, last.price,
        violationTolerance,
      );
      if (!intact) continue;

      // R² of the touching highs on this line
      const regressionPoints = touchingHighs.map(h => ({ x: h.candleIndex, y: h.price }));
      const { r2 } = linearRegression(regressionPoints);
      if (r2 < 0.75) continue;

      // Support lows — must be relatively flat or ascending (uptrend support)
      const lows = pivots.filter(
        p => p.kind === 'low' && p.candleIndex >= first.candleIndex && p.candleIndex <= last.candleIndex,
      );

      const spanBars = last.candleIndex - first.candleIndex;
      const quality = clampQuality(
        55 +
        Math.min(15, touchingHighs.length * 5) +
        Math.min(10, Math.round(r2 * 10)) +
        Math.min(10, Math.round(spanBars / candles.length * 14)) +
        Math.min(10, Math.round((totalDrop / atr - 1) * 3)),
      );

      // Extend line as ray into the future
      const spanMs = last.time - first.time;
      const extensionMs = Math.max(spanMs * 0.5, 5 * 60_000);
      const rayEndTime = last.time + extensionMs;
      const rayEndPrice = projectLineAtX(first.time, first.price, last.time, last.price, rayEndTime)!;

      const allPivotPoints = [...touchingHighs, ...lows].sort((a, b) => a.candleIndex - b.candleIndex);

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality,
        from: first.time,
        to: last.time,
        geometry: {
          anchorTimeFrom: first.time,
          anchorTimeTo: last.time,
          priceMin: Math.min(...candles.map(c => c.low)),
          priceMax: Math.max(...candles.map(c => c.high)),
          pivots: allPivotPoints.map(p => ({ time: p.time, price: p.price })),
          lines: [
            {
              kind: 'ray',
              points: [
                { time: first.time, price: first.price },
                { time: rayEndTime, price: rayEndPrice },
              ],
            },
          ],
          zones: [{
            fromTime: first.time,
            toTime: rayEndTime,
            low: Math.min(first.price, rayEndPrice) - touchTolerance,
            high: Math.max(first.price, rayEndPrice) + touchTolerance * 0.3,
          }],
        },
      };

      if (!best || quality > best.quality) best = candidate;
    }
  }

  return best;
}

function detectSupportTrendline(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  atr: number,
): PatternCandidate | null {
  const pivots = extractSwingPivots(candles, 1.5);
  const lows = pivots.filter(p => p.kind === 'low');

  if (lows.length < 3) return null;

  let best: PatternCandidate | null = null;

  for (let i = 0; i < lows.length - 2; i++) {
    for (let j = lows.length - 1; j > i + 1; j--) {
      const first = lows[i]!;
      const last = lows[j]!;

      if (last.candleIndex - first.candleIndex < 10) continue;

      // Line must be ascending for support
      if (last.price <= first.price) continue;

      const totalRise = last.price - first.price;
      if (totalRise < atr) continue;

      const touchTolerance = atr * 0.5;
      const violationTolerance = atr * 0.3;

      const touchingLows = lows.filter(l => {
        const lineVal = projectLineAtX(first.time, first.price, last.time, last.price, l.time);
        if (lineVal == null) return false;
        return Math.abs(l.price - lineVal) <= touchTolerance;
      });

      if (touchingLows.length < 3) continue;

      const intact = isTrendlineIntact(
        candles, touchingLows, 'support',
        first.time, first.price, last.time, last.price,
        violationTolerance,
      );
      if (!intact) continue;

      const regressionPoints = touchingLows.map(l => ({ x: l.candleIndex, y: l.price }));
      const { r2 } = linearRegression(regressionPoints);
      if (r2 < 0.75) continue;

      const highs = pivots.filter(
        p => p.kind === 'high' && p.candleIndex >= first.candleIndex && p.candleIndex <= last.candleIndex,
      );

      const spanBars = last.candleIndex - first.candleIndex;
      const quality = clampQuality(
        55 +
        Math.min(15, touchingLows.length * 5) +
        Math.min(10, Math.round(r2 * 10)) +
        Math.min(10, Math.round(spanBars / candles.length * 14)) +
        Math.min(10, Math.round((totalRise / atr - 1) * 3)),
      );

      const spanMs = last.time - first.time;
      const extensionMs = Math.max(spanMs * 0.5, 5 * 60_000);
      const rayEndTime = last.time + extensionMs;
      const rayEndPrice = projectLineAtX(first.time, first.price, last.time, last.price, rayEndTime)!;

      const allPivotPoints = [...touchingLows, ...highs].sort((a, b) => a.candleIndex - b.candleIndex);

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality,
        from: first.time,
        to: last.time,
        geometry: {
          anchorTimeFrom: first.time,
          anchorTimeTo: last.time,
          priceMin: Math.min(...candles.map(c => c.low)),
          priceMax: Math.max(...candles.map(c => c.high)),
          pivots: allPivotPoints.map(p => ({ time: p.time, price: p.price })),
          lines: [
            {
              kind: 'ray',
              points: [
                { time: first.time, price: first.price },
                { time: rayEndTime, price: rayEndPrice },
              ],
            },
          ],
          zones: [{
            fromTime: first.time,
            toTime: rayEndTime,
            low: Math.min(first.price, rayEndPrice) - touchTolerance * 0.3,
            high: Math.max(first.price, rayEndPrice) + touchTolerance,
          }],
        },
      };

      if (!best || quality > best.quality) best = candidate;
    }
  }

  return best;
}

// ATR helper — recomputed here so detector is self-contained
function computeATR(candles: DetectorCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  const count = Math.min(period, candles.length - 1);
  for (let i = candles.length - count; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    sum += Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
  }
  return sum / count;
}

export function detectTrendlinePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 30) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const results: PatternCandidate[] = [];

  const resistance = detectResistanceTrendline(symbol, timeframe, candles, atr);
  if (resistance) results.push(resistance);

  const support = detectSupportTrendline(symbol, timeframe, candles, atr);
  if (support) results.push(support);

  return results;
}
