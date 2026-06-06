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

// Verify triangle bounds using HIGH and LOW (not close) — proper candle containment
function isTriangleIntact(
  candles: DetectorCandle[],
  fromTime: number,
  toTime: number,
  upperX1: number, upperY1: number, upperX2: number, upperY2: number,
  lowerX1: number, lowerY1: number, lowerX2: number, lowerY2: number,
  tol: number,
): boolean {
  for (const candle of candles) {
    if (candle.time < fromTime || candle.time > toTime) continue;
    const upper = projectLineAtX(upperX1, upperY1, upperX2, upperY2, candle.time);
    const lower = projectLineAtX(lowerX1, lowerY1, lowerX2, lowerY2, candle.time);
    if (upper == null || lower == null) continue;
    // Check high vs upper boundary, low vs lower boundary
    if (candle.high > upper + tol) return false;
    if (candle.low < lower - tol) return false;
  }
  return true;
}

// Extract sequential alternating pivot series for triangle detection.
// Returns the longest run of strictly decreasing highs interleaved with
// strictly increasing lows, starting from the most recent pivots.
function findTrianglePivotSeries(pivots: SwingPivot[]): {
  highs: SwingPivot[];
  lows: SwingPivot[];
} | null {
  if (pivots.length < 6) return null;

  // Work backwards from the end to find the most recent triangle
  // Look for runs of alternating pivots: H L H L H L ...
  // The sequence must start with a high and end where we have enough
  for (let startIdx = pivots.length - 6; startIdx >= 0; startIdx--) {
    const slice = pivots.slice(startIdx);

    // Need alternating sequence starting with high or low
    // Try both starting kinds
    for (const startKind of ['high', 'low'] as const) {
      const firstPivot = slice[0];
      if (!firstPivot || firstPivot.kind !== startKind) continue;

      // Collect alternating sequence
      const seq: SwingPivot[] = [firstPivot];
      for (let k = 1; k < slice.length; k++) {
        const prev = seq[seq.length - 1]!;
        const curr = slice[k]!;
        if (curr.kind !== prev.kind) {
          seq.push(curr);
        }
      }

      if (seq.length < 6) continue;

      // Extract highs and lows from the sequence
      const seqHighs = seq.filter(p => p.kind === 'high');
      const seqLows = seq.filter(p => p.kind === 'low');

      if (seqHighs.length < 3 || seqLows.length < 3) continue;

      // Check that highs are strictly descending
      const descendingHighs = seqHighs.every((h, i) => i === 0 || h.price < seqHighs[i - 1]!.price);
      if (!descendingHighs) continue;

      // Check that lows are strictly ascending
      const ascendingLows = seqLows.every((l, i) => i === 0 || l.price > seqLows[i - 1]!.price);
      if (!ascendingLows) continue;

      return { highs: seqHighs, lows: seqLows };
    }
  }

  return null;
}

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 30) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  // Use standard multiplier — triangles form on normal swings
  const pivots = extractSwingPivots(candles, 1.5);
  if (pivots.length < 6) return [];

  const series = findTrianglePivotSeries(pivots);
  if (!series) return [];

  const { highs, lows } = series;

  const h1 = highs[0]!;
  const hN = highs[highs.length - 1]!;
  const l1 = lows[0]!;
  const lN = lows[lows.length - 1]!;

  // Overlap window: both lines must exist simultaneously
  const overlapStart = Math.max(h1.time, l1.time);
  const overlapEnd = Math.min(hN.time, lN.time);
  if (overlapEnd <= overlapStart) return [];

  const overlapStartIdx = Math.max(h1.candleIndex, l1.candleIndex);
  const overlapEndIdx = Math.min(hN.candleIndex, lN.candleIndex);
  if (overlapEndIdx - overlapStartIdx < 15) return [];

  // Upper and lower line values at key points
  const upperAtStart = projectLineAtX(h1.time, h1.price, hN.time, hN.price, overlapStart);
  const lowerAtStart = projectLineAtX(l1.time, l1.price, lN.time, lN.price, overlapStart);
  const upperAtEnd = projectLineAtX(h1.time, h1.price, hN.time, hN.price, overlapEnd);
  const lowerAtEnd = projectLineAtX(l1.time, l1.price, lN.time, lN.price, overlapEnd);

  if (upperAtStart == null || lowerAtStart == null || upperAtEnd == null || lowerAtEnd == null) {
    return [];
  }

  // Upper must be above lower throughout
  if (upperAtStart <= lowerAtStart || upperAtEnd <= lowerAtEnd) return [];

  const widthStart = upperAtStart - lowerAtStart;
  const widthEnd = upperAtEnd - lowerAtEnd;

  // Triangle must have converged by at least 25%
  if (widthEnd >= widthStart * 0.75) return [];

  // Width must be meaningful at start
  if (widthStart < atr * 2) return [];

  // All candle highs/lows inside the triangle must respect boundaries
  const tol = atr * 0.5;
  const intact = isTriangleIntact(
    candles,
    overlapStart, overlapEnd,
    h1.time, h1.price, hN.time, hN.price,
    l1.time, l1.price, lN.time, lN.price,
    tol,
  );
  if (!intact) return [];

  // Current price must be relevant
  const currentCandle = candles[candles.length - 1]!;
  const upperNow = projectLineAtX(h1.time, h1.price, hN.time, hN.price, currentCandle.time);
  const lowerNow = projectLineAtX(l1.time, l1.price, lN.time, lN.price, currentCandle.time);
  if (upperNow == null || lowerNow == null) return [];

  const insideTriangle = currentCandle.close <= upperNow && currentCandle.close >= lowerNow;
  const justBrokeOut =
    (currentCandle.close > upperNow && currentCandle.close - upperNow < atr * 2) ||
    (currentCandle.close < lowerNow && lowerNow - currentCandle.close < atr * 2);

  if (!insideTriangle && !justBrokeOut) return [];

  // R² fit quality
  const { r2: upperR2 } = linearRegression(highs.map(h => ({ x: h.candleIndex, y: h.price })));
  const { r2: lowerR2 } = linearRegression(lows.map(l => ({ x: l.candleIndex, y: l.price })));
  if (upperR2 < 0.80 || lowerR2 < 0.80) return [];

  const convergenceRatio = 1 - widthEnd / widthStart;
  const spanBars = overlapEndIdx - overlapStartIdx;
  const status = justBrokeOut ? 'confirmed' : 'forming';

  const quality = clampQuality(
    56 +
    Math.min(12, highs.length * 4) +
    Math.min(12, lows.length * 4) +
    Math.min(8, Math.round(convergenceRatio * 10)) +
    Math.min(8, Math.round(spanBars / candles.length * 12)) +
    Math.min(4, Math.round((upperR2 + lowerR2 - 1.6) * 5)),
  );

  // Apex zone — last 30% of the triangle span
  const apexStartTime = overlapStart + Math.floor((overlapEnd - overlapStart) * 0.70);
  const upperAtApex = projectLineAtX(h1.time, h1.price, hN.time, hN.price, apexStartTime);
  const lowerAtApex = projectLineAtX(l1.time, l1.price, lN.time, lN.price, apexStartTime);

  const zones =
    upperAtApex != null && lowerAtApex != null
      ? [{
          fromTime: apexStartTime,
          toTime: overlapEnd,
          low: Math.min(lowerAtApex, lowerAtEnd),
          high: Math.max(upperAtApex, upperAtEnd),
        }]
      : [];

  const allPivots = [...highs, ...lows].sort((a, b) => a.candleIndex - b.candleIndex);

  return [{
    id: randomUUID(),
    exchange: 'binance',
    marketType: 'futures',
    symbol,
    timeframe,
    kind: 'triangle',
    status,
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
            { time: hN.time, price: hN.price },
          ],
        },
        {
          kind: 'segment',
          points: [
            { time: l1.time, price: l1.price },
            { time: lN.time, price: lN.price },
          ],
        },
      ],
      zones,
    },
  }];
}
