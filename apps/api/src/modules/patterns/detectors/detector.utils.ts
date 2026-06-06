import type { Candle } from '@crypto-screener/shared';

export interface SwingPivot {
  kind: 'high' | 'low';
  time: number;
  price: number;
  candleIndex: number;
}

/**
 * Calculates Average True Range (ATR) to normalize volatility.
 */
export function computeATR(candles: Candle[], period = 14): number {
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
 * Extracts structural swing points using a modified ZigZag algorithm based on ATR.
 * This filters out market noise and keeps only significant pivots.
 */
export function extractStructuralPivots(
  candles: Candle[],
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
