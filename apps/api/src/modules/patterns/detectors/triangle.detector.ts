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

// Verify no candle between first and last pivot closes outside the triangle
function isTriangleIntact(
  candles: DetectorCandle[],
  fromTime: number,
  toTime: number,
  upperX1: number, upperY1: number, upperX2: number, upperY2: number,
  lowerX1: number, lowerY1: number, lowerX2: number, lowerY2: number,
  violationTolerance: number,
): boolean {
  for (const candle of candles) {
    if (candle.time < fromTime || candle.time > toTime) continue;

    const upper = projectLineAtX(upperX1, upperY1, upperX2, upperY2, candle.time);
    const lower = projectLineAtX(lowerX1, lowerY1, lowerX2, lowerY2, candle.time);
    if (upper == null || lower == null) continue;

    if (candle.close > upper + violationTolerance) return false;
    if (candle.close < lower - violationTolerance) return false;
  }
  return true;
}

// Check if current price is inside or just exited the triangle (within 1 ATR of boundary)
function isPriceRelevant(
  currentClose: number,
  currentTime: number,
  upperX1: number, upperY1: number, upperX2: number, upperY2: number,
  lowerX1: number, lowerY1: number, lowerX2: number, lowerY2: number,
  atr: number,
): boolean {
  const upper = projectLineAtX(upperX1, upperY1, upperX2, upperY2, currentTime);
  const lower = projectLineAtX(lowerX1, lowerY1, lowerX2, lowerY2, currentTime);
  if (upper == null || lower == null) return false;

  // Inside triangle
  if (currentClose <= upper && currentClose >= lower) return true;

  // Just broke out (within 1.5 ATR)
  if (currentClose > upper && currentClose - upper < atr * 1.5) return true;
  if (currentClose < lower && lower - currentClose < atr * 1.5) return true;

  return false;
}

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 30) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const pivots = extractSwingPivots(candles, 1.5);
  const highs = pivots.filter(p => p.kind === 'high');
  const lows = pivots.filter(p => p.kind === 'low');

  if (highs.length < 2 || lows.length < 2) return [];

  const currentCandle = candles[candles.length - 1]!;
  const touchTolerance = atr * 0.5;
  const violationTolerance = atr * 0.4;

  let best: PatternCandidate | null = null;

  // Try every pair of highs as the upper line and pair of lows as the lower line
  for (let hi = 0; hi < highs.length - 1; hi++) {
    for (let hj = hi + 1; hj < highs.length; hj++) {
      const h1 = highs[hi]!;
      const h2 = highs[hj]!;

      // Upper line must descend
      if (h2.price >= h1.price) continue;
      if (h2.candleIndex - h1.candleIndex < 8) continue;

      for (let li = 0; li < lows.length - 1; li++) {
        for (let lj = li + 1; lj < lows.length; lj++) {
          const l1 = lows[li]!;
          const l2 = lows[lj]!;

          // Lower line must ascend
          if (l2.price <= l1.price) continue;
          if (l2.candleIndex - l1.candleIndex < 8) continue;

          // Overlap in time: both lines must coexist for a meaningful span
          const overlapStart = Math.max(h1.time, l1.time);
          const overlapEnd = Math.min(h2.time, l2.time);
          if (overlapEnd <= overlapStart) continue;

          const overlapStartIdx = Math.max(h1.candleIndex, l1.candleIndex);
          const overlapEndIdx = Math.min(h2.candleIndex, l2.candleIndex);
          if (overlapEndIdx - overlapStartIdx < 8) continue;

          // At the overlap start, upper line must be above lower line
          const upperAtStart = projectLineAtX(h1.time, h1.price, h2.time, h2.price, overlapStart);
          const lowerAtStart = projectLineAtX(l1.time, l1.price, l2.time, l2.price, overlapStart);
          if (upperAtStart == null || lowerAtStart == null) continue;
          if (upperAtStart <= lowerAtStart) continue;

          // Lines must converge (not diverge) — check at overlapEnd
          const upperAtEnd = projectLineAtX(h1.time, h1.price, h2.time, h2.price, overlapEnd);
          const lowerAtEnd = projectLineAtX(l1.time, l1.price, l2.time, l2.price, overlapEnd);
          if (upperAtEnd == null || lowerAtEnd == null) continue;
          if (upperAtEnd <= lowerAtEnd) continue;

          const widthStart = upperAtStart - lowerAtStart;
          const widthEnd = upperAtEnd - lowerAtEnd;

          // Triangle must have converged by at least 30%
          if (widthEnd >= widthStart * 0.7) continue;

          // Width at start must be meaningful: at least 2 ATR
          if (widthStart < atr * 2) continue;

          // Count highs that actually touch the upper line
          const touchingHighs = highs.filter(h => {
            if (h.candleIndex < overlapStartIdx || h.candleIndex > overlapEndIdx) return false;
            const lineVal = projectLineAtX(h1.time, h1.price, h2.time, h2.price, h.time);
            if (lineVal == null) return false;
            return Math.abs(h.price - lineVal) <= touchTolerance;
          });

          // Count lows that actually touch the lower line
          const touchingLows = lows.filter(l => {
            if (l.candleIndex < overlapStartIdx || l.candleIndex > overlapEndIdx) return false;
            const lineVal = projectLineAtX(l1.time, l1.price, l2.time, l2.price, l.time);
            if (lineVal == null) return false;
            return Math.abs(l.price - lineVal) <= touchTolerance;
          });

          if (touchingHighs.length < 2 || touchingLows.length < 2) continue;

          // Triangle must not be broken inside
          const intact = isTriangleIntact(
            candles,
            overlapStart, overlapEnd,
            h1.time, h1.price, h2.time, h2.price,
            l1.time, l1.price, l2.time, l2.price,
            violationTolerance,
          );
          if (!intact) continue;

          // Current price must be relevant to the triangle
          const relevant = isPriceRelevant(
            currentCandle.close, currentCandle.time,
            h1.time, h1.price, h2.time, h2.price,
            l1.time, l1.price, l2.time, l2.price,
            atr,
          );
          if (!relevant) continue;

          // R² fit of both lines
          const upperR2 = linearRegression(touchingHighs.map(h => ({ x: h.candleIndex, y: h.price }))).r2;
          const lowerR2 = linearRegression(touchingLows.map(l => ({ x: l.candleIndex, y: l.price }))).r2;
          if (upperR2 < 0.7 || lowerR2 < 0.7) continue;

          const convergenceRatio = 1 - widthEnd / widthStart;
          const spanBars = overlapEndIdx - overlapStartIdx;

          const quality = clampQuality(
            55 +
            Math.min(12, touchingHighs.length * 4) +
            Math.min(12, touchingLows.length * 4) +
            Math.min(8, Math.round(convergenceRatio * 10)) +
            Math.min(8, Math.round(spanBars / candles.length * 12)) +
            Math.min(5, Math.round((upperR2 + lowerR2) * 2.5)),
          );

          // Apex zone: last 35% of the triangle
          const apexStart = overlapStart + Math.floor((overlapEnd - overlapStart) * 0.65);
          const upperAtApex = projectLineAtX(h1.time, h1.price, h2.time, h2.price, apexStart);
          const lowerAtApex = projectLineAtX(l1.time, l1.price, l2.time, l2.price, apexStart);

          const apexZones =
            upperAtApex != null && lowerAtApex != null
              ? [{
                  fromTime: apexStart,
                  toTime: overlapEnd,
                  low: Math.min(lowerAtApex, lowerAtEnd),
                  high: Math.max(upperAtApex, upperAtEnd),
                }]
              : [];

          const allPivots = [...touchingHighs, ...touchingLows]
            .sort((a, b) => a.candleIndex - b.candleIndex);

          const candidate: PatternCandidate = {
            id: randomUUID(),
            exchange: 'binance',
            marketType: 'futures',
            symbol,
            timeframe,
            kind: 'triangle',
            status: 'forming',
            quality,
            from: overlapStart,
            to: overlapEnd,
            geometry: {
              anchorTimeFrom: overlapStart,
              anchorTimeTo: overlapEnd,
              priceMin: Math.min(...candles.map(c => c.low)),
              priceMax: Math.max(...candles.map(c => c.high)),
              pivots: allPivots.map(p => ({ time: p.time, price: p.price })),
              lines: [
                {
                  kind: 'segment',
                  points: [
                    { time: h1.time, price: h1.price },
                    { time: h2.time, price: h2.price },
                  ],
                },
                {
                  kind: 'segment',
                  points: [
                    { time: l1.time, price: l1.price },
                    { time: l2.time, price: l2.price },
                  ],
                },
              ],
              zones: apexZones,
            },
          };

          if (!best || quality > best.quality) best = candidate;
        }
      }
    }
  }

  return best ? [best] : [];
}
