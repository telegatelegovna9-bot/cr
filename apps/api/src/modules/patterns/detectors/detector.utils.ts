import type { Candle } from '@crypto-screener/shared';
import type { DetectorCandle, DetectorPivotCandle, PatternCandidate, PatternDetector } from './detector.types';

export interface SwingPivot {
  kind: 'high' | 'low';
  time: number;
  price: number;
  candleIndex: number;
}

export function clampQuality(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function toPivotWindow(candles: DetectorCandle[]): DetectorPivotCandle[] {
  return candles.map((candle, index) => ({ ...candle, index }));
}

/**
 * Calculates Average True Range (ATR) to normalize volatility.
 */
export function computeATR(candles: Candle[] | DetectorCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  let trSum = 0;
  const count = Math.min(period, candles.length - 1);
  for (let i = candles.length - count; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trSum += tr;
  }
  return trSum / count;
}

/**
 * Legacy alias for extractStructuralPivots
 */
export function extractSwingPivots(candles: Candle[] | DetectorCandle[], atrMultiplier = 1.5): SwingPivot[] {
  return extractStructuralPivots(candles, atrMultiplier);
}

/**
 * Extracts structural swing points using a modified ZigZag algorithm based on ATR.
 * This filters out market noise and keeps only significant pivots.
 */
export function extractStructuralPivots(
  candles: Candle[] | DetectorCandle[],
  atrMultiplier = 2.0, // Higher = more structural/less noise
): SwingPivot[] {
  if (candles.length < 10) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];
  const minMove = atr * atrMultiplier;

  const pivots: SwingPivot[] = [];

  let direction: 'up' | 'down' = candles[1].close >= candles[0].close ? 'up' : 'down';
  let extremeIndex = 0;
  let extremePrice = direction === 'up' ? candles[0].high : candles[0].low;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    if (direction === 'up') {
      if (c.high >= extremePrice) {
        extremePrice = c.high;
        extremeIndex = i;
      } else if (extremePrice - c.low >= minMove) {
        pivots.push({
          kind: 'high',
          time: candles[extremeIndex].time,
          price: extremePrice,
          candleIndex: extremeIndex,
        });
        direction = 'down';
        extremePrice = c.low;
        extremeIndex = i;
      }
    } else {
      if (c.low <= extremePrice) {
        extremePrice = c.low;
        extremeIndex = i;
      } else if (c.high - extremePrice >= minMove) {
        pivots.push({
          kind: 'low',
          time: candles[extremeIndex].time,
          price: extremePrice,
          candleIndex: extremeIndex,
        });
        direction = 'up';
        extremePrice = c.high;
        extremeIndex = i;
      }
    }
  }

  return pivots;
}

/**
 * Legacy alias for calculateLinearRegression
 */
export function linearRegression(points: { x: number; y: number }[]) {
  return calculateLinearRegression(points);
}

/**
 * Linear regression to find the best fit line for a set of points.
 * Returns slope, intercept, and R-Squared (correlation coefficient).
 */
export function calculateLinearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    ssTot += Math.pow(p.y - meanY, 2);
    ssRes += Math.pow(p.y - (slope * p.x + intercept), 2);
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

/**
 * Legacy alias for projectPriceAtTime
 */
export function projectLineAtX(x1: number, y1: number, x2: number, y2: number, targetX: number): number {
  return projectPriceAtTime(x1, y1, x2, y2, targetX);
}

/**
 * Projects a price based on a line (x1,y1) -> (x2,y2) at a specific timestamp.
 */
export function projectPriceAtTime(
  x1: number, y1: number,
  x2: number, y2: number,
  targetX: number,
): number {
  const dx = x2 - x1;
  if (dx === 0) return y1;
  return y1 + (y2 - y1) * (targetX - x1) / dx;
}

export function patternsOverlapTooMuch(
  a: Pick<PatternCandidate, 'kind' | 'timeframe' | 'symbol' | 'from' | 'to'>,
  b: Pick<PatternCandidate, 'kind' | 'timeframe' | 'symbol' | 'from' | 'to'>,
): boolean {
  if (a.kind !== b.kind || a.timeframe !== b.timeframe || a.symbol !== b.symbol) {
    return false;
  }

  const intersection = Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
  const union = Math.max(a.to, b.to) - Math.min(a.from, b.from);

  if (union <= 0) return false;

  return intersection / union >= 0.7;
}

export function scanDetectorAcrossWindows(
  symbol: string,
  timeframe: PatternCandidate['timeframe'],
  candles: DetectorCandle[],
  detector: PatternDetector,
): PatternCandidate[] {
  if (candles.length < 72) {
    return detector(symbol, timeframe, candles);
  }

  const candidates: PatternCandidate[] = [];
  const windowSizes = [72, 96, 120, 144, 192, 240, 300].filter(size => size <= candles.length);

  for (const size of windowSizes) {
    const step = Math.max(12, Math.floor(size / 3));
    for (let start = 0; start + size <= candles.length; start += step) {
      const window = candles.slice(start, start + size);
      const detected = detector(symbol, timeframe, window).sort((a, b) => b.quality - a.quality);

      for (const candidate of detected) {
        const duplicate = candidates.find(existing =>
          patternsOverlapTooMuch(existing, candidate) && existing.quality >= candidate.quality,
        );
        if (!duplicate) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates.sort((a, b) => b.quality - a.quality);
}

export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const limit = Math.max(1, concurrency);
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= tasks.length) return;
      results[currentIndex] = await tasks[currentIndex]!();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}
