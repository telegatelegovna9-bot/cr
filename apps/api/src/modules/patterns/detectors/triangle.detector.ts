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

function isTriangleIntact(
  candles: DetectorCandle[],
  fromTime: number,
  toTime: number,
  upperX1: number,
  upperY1: number,
  upperX2: number,
  upperY2: number,
  lowerX1: number,
  lowerY1: number,
  lowerX2: number,
  lowerY2: number,
  tol: number,
): boolean {
  for (const candle of candles) {
    if (candle.time < fromTime || candle.time > toTime) continue;
    const upper = projectLineAtX(upperX1, upperY1, upperX2, upperY2, candle.time);
    const lower = projectLineAtX(lowerX1, lowerY1, lowerX2, lowerY2, candle.time);
    if (upper == null || lower == null) continue;
    if (candle.high > upper + tol) return false;
    if (candle.low < lower - tol) return false;
  }
  return true;
}

function findTrianglePivotSeries(pivots: SwingPivot[]): {
  highs: SwingPivot[];
  lows: SwingPivot[];
} | null {
  if (pivots.length < 6) return null;

  let bestSeries: { highs: SwingPivot[]; lows: SwingPivot[] } | null = null;
  let bestPivotCount = 0;
  let bestSpan = 0;

  for (let startIdx = pivots.length - 6; startIdx >= 0; startIdx--) {
    const slice = pivots.slice(startIdx);

    for (const startKind of ['high', 'low'] as const) {
      const firstPivot = slice[0];
      if (!firstPivot || firstPivot.kind !== startKind) continue;

      const seq: SwingPivot[] = [firstPivot];
      for (let index = 1; index < slice.length; index++) {
        const prev = seq[seq.length - 1]!;
        const curr = slice[index]!;
        if (curr.kind !== prev.kind) {
          seq.push(curr);
        }
      }

      if (seq.length < 6) continue;

      const seqHighs = seq.filter(p => p.kind === 'high');
      const seqLows = seq.filter(p => p.kind === 'low');
      if (seqHighs.length < 3 || seqLows.length < 3) continue;

      const descendingHighs = seqHighs.every((high, idx) => idx === 0 || high.price < seqHighs[idx - 1]!.price);
      const ascendingLows = seqLows.every((low, idx) => idx === 0 || low.price > seqLows[idx - 1]!.price);
      if (!descendingHighs || !ascendingLows) continue;

      const pivotCount = seqHighs.length + seqLows.length;
      const firstTime = Math.min(seqHighs[0]!.time, seqLows[0]!.time);
      const lastTime = Math.max(
        seqHighs[seqHighs.length - 1]!.time,
        seqLows[seqLows.length - 1]!.time,
      );
      const span = lastTime - firstTime;

      if (pivotCount > bestPivotCount || (pivotCount === bestPivotCount && span > bestSpan)) {
        bestSeries = { highs: seqHighs, lows: seqLows };
        bestPivotCount = pivotCount;
        bestSpan = span;
      }
    }
  }

  return bestSeries;
}

function buildTriangleCandidate(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  atr: number,
  pivots: SwingPivot[],
): PatternCandidate | null {
  const series = findTrianglePivotSeries(pivots);
  if (!series) return null;

  const { highs, lows } = series;
  const h1 = highs[0]!;
  const hN = highs[highs.length - 1]!;
  const l1 = lows[0]!;
  const lN = lows[lows.length - 1]!;

  const overlapStart = Math.max(h1.time, l1.time);
  const overlapEnd = Math.min(hN.time, lN.time);
  if (overlapEnd <= overlapStart) return null;

  const overlapStartIdx = Math.max(h1.candleIndex, l1.candleIndex);
  const overlapEndIdx = Math.min(hN.candleIndex, lN.candleIndex);
  if (overlapEndIdx - overlapStartIdx < 10) return null;

  const upperAtStart = projectLineAtX(h1.time, h1.price, hN.time, hN.price, overlapStart);
  const lowerAtStart = projectLineAtX(l1.time, l1.price, lN.time, lN.price, overlapStart);
  const upperAtEnd = projectLineAtX(h1.time, h1.price, hN.time, hN.price, overlapEnd);
  const lowerAtEnd = projectLineAtX(l1.time, l1.price, lN.time, lN.price, overlapEnd);
  if (upperAtStart == null || lowerAtStart == null || upperAtEnd == null || lowerAtEnd == null) {
    return null;
  }

  if (upperAtStart <= lowerAtStart || upperAtEnd <= lowerAtEnd) return null;

  const widthStart = upperAtStart - lowerAtStart;
  const widthEnd = upperAtEnd - lowerAtEnd;
  if (widthEnd >= widthStart * 0.8) return null;
  if (widthStart < atr * 1.5) return null;

  const tol = atr * 0.65;
  const intact = isTriangleIntact(
    candles,
    overlapStart,
    overlapEnd,
    h1.time,
    h1.price,
    hN.time,
    hN.price,
    l1.time,
    l1.price,
    lN.time,
    lN.price,
    tol,
  );
  if (!intact) return null;

  const currentCandle = candles[candles.length - 1]!;
  const upperNow = projectLineAtX(h1.time, h1.price, hN.time, hN.price, currentCandle.time);
  const lowerNow = projectLineAtX(l1.time, l1.price, lN.time, lN.price, currentCandle.time);
  const justBrokeOut =
    upperNow != null && lowerNow != null
      ? (
          (currentCandle.close > upperNow && currentCandle.close - upperNow < atr * 2) ||
          (currentCandle.close < lowerNow && lowerNow - currentCandle.close < atr * 2)
        )
      : false;

  const { r2: upperR2 } = linearRegression(highs.map(high => ({ x: high.candleIndex, y: high.price })));
  const { r2: lowerR2 } = linearRegression(lows.map(low => ({ x: low.candleIndex, y: low.price })));
  if (upperR2 < 0.72 || lowerR2 < 0.72) return null;

  const convergenceRatio = 1 - widthEnd / widthStart;
  const spanBars = overlapEndIdx - overlapStartIdx;
  const status = justBrokeOut ? 'confirmed' : 'forming';
  const quality = clampQuality(
    52 +
      Math.min(12, highs.length * 4) +
      Math.min(12, lows.length * 4) +
      Math.min(10, Math.round(convergenceRatio * 12)) +
      Math.min(8, Math.round((spanBars / candles.length) * 12)) +
      Math.min(6, Math.round((upperR2 + lowerR2 - 1.44) * 8)),
  );

  const apexStartTime = overlapStart + Math.floor((overlapEnd - overlapStart) * 0.7);
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

  return {
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
  };
}

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 24) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  let bestCandidate: PatternCandidate | null = null;

  for (const pivotMultiplier of [1.2, 1.5, 1.8]) {
    const pivots = extractSwingPivots(candles, pivotMultiplier);
    if (pivots.length < 6) continue;

    const candidate = buildTriangleCandidate(symbol, timeframe, candles, atr, pivots);
    if (!candidate) continue;

    if (
      !bestCandidate ||
      candidate.quality > bestCandidate.quality ||
      (candidate.quality === bestCandidate.quality &&
        candidate.geometry.anchorTimeTo - candidate.geometry.anchorTimeFrom >
          bestCandidate.geometry.anchorTimeTo - bestCandidate.geometry.anchorTimeFrom)
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate ? [bestCandidate] : [];
}
