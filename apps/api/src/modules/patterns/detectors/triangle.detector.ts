import { clampQuality, computeATR, extractStructuralPivots } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe, PatternGeometry } from '../patterns.types';
import { buildSetupId, getTimeframeDurationMs } from './setup-helpers';

function linearRegression(xValues: number[], yValues: number[]): { slope: number; intercept: number; r2: number } {
  const n = xValues.length;
  if (n < 2) return { slope: 0, intercept: yValues[0] ?? 0, r2: 0 };

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((a, x, i) => a + x * yValues[i]!, 0);
  const sumXX = xValues.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;

  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTotal = yValues.reduce((ss, y) => ss + (y - meanY) ** 2, 0);
  const ssRes = yValues.reduce((ss, y, i) => {
    const pred = slope * xValues[i]! + intercept;
    return ss + (y - pred) ** 2;
  }, 0);
  const r2 = ssTotal === 0 ? 1 : Math.max(0, 1 - ssRes / ssTotal);

  return { slope, intercept, r2 };
}

export function detectTriangleSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 60) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const pivotMult = timeframe === '1d' ? 1.2 : timeframe === '4h' ? 1.3 : 1.5;
  const pivots = extractStructuralPivots(candles, pivotMult);

  const highs = pivots.filter(p => p.kind === 'high').slice(-6);
  const lows = pivots.filter(p => p.kind === 'low').slice(-6);

  if (highs.length < 2 || lows.length < 2) return [];

  const current = candles[candles.length - 1]!;
  const currentIdx = candles.length - 1;
  const timeframeMs = getTimeframeDurationMs(timeframe);

  const highReg = linearRegression(highs.map(h => h.candleIndex), highs.map(h => h.price));
  const lowReg = linearRegression(lows.map(l => l.candleIndex), lows.map(l => l.price));

  const projHigh = highReg.intercept + highReg.slope * currentIdx;
  const projLow = lowReg.intercept + lowReg.slope * currentIdx;

  // Price must be inside triangle
  if (current.close > projHigh + atr * 0.4 || current.close < projLow - atr * 0.4) return [];

  const spread = projHigh - projLow;
  if (spread <= 0 || spread > atr * 8) return [];

  // Both regression fits must be decent
  if (highReg.r2 < 0.45 && lowReg.r2 < 0.45) return [];

  // Normalize slopes
  const normHigh = highReg.slope / atr;
  const normLow = lowReg.slope / atr;
  const FLAT = 0.025;

  let triangleSubtype: 'ascending' | 'descending' | 'symmetrical';
  if (Math.abs(normHigh) <= FLAT && normLow > FLAT) {
    triangleSubtype = 'ascending';
  } else if (normHigh < -FLAT && Math.abs(normLow) <= FLAT) {
    triangleSubtype = 'descending';
  } else if (normHigh < -FLAT && normLow > FLAT) {
    triangleSubtype = 'symmetrical';
  } else {
    return [];
  }

  // Lines must be converging — check spread is decreasing
  const earlyIdx = Math.max(0, currentIdx - 30);
  const earlySpread = (highReg.intercept + highReg.slope * earlyIdx) - (lowReg.intercept + lowReg.slope * earlyIdx);
  if (earlySpread <= spread + atr * 0.1) return [];

  // Find apex
  const slopesDiff = highReg.slope - lowReg.slope;
  if (Math.abs(slopesDiff) < 1e-10) return [];
  const apexIdx = (lowReg.intercept - highReg.intercept) / slopesDiff;
  const apexBarsAhead = apexIdx - currentIdx;
  if (apexBarsAhead < 2) return [];

  // Stable ID anchors
  const allPivotTimes = [...highs, ...lows].map(p => p.time);
  const fromTime = Math.min(...allPivotTimes);
  const lastPivotTime = Math.max(...allPivotTimes);

  const patternDuration = lastPivotTime - fromTime;
  const extendedToTime = lastPivotTime + Math.max(patternDuration * 0.35, 5 * 60_000);

  const highsByTime = [...highs].sort((a, b) => a.time - b.time);
  const lowsByTime = [...lows].sort((a, b) => a.time - b.time);
  const upperFrom = { time: highsByTime[0]!.time, price: highsByTime[0]!.price };
  const upperLast = highsByTime[highsByTime.length - 1]!;
  const lowerFrom = { time: lowsByTime[0]!.time, price: lowsByTime[0]!.price };
  const lowerLast = lowsByTime[lowsByTime.length - 1]!;
  const lineEndTime = Math.min(
    extendedToTime,
    Math.max(lastPivotTime + timeframeMs * 2, Math.floor(fromTime + Math.max(0, apexIdx) * timeframeMs)),
  );
  const upperBarsAhead = Math.max(1, Math.round((lineEndTime - upperLast.time) / timeframeMs));
  const lowerBarsAhead = Math.max(1, Math.round((lineEndTime - lowerLast.time) / timeframeMs));
  const projectedUpper = upperLast.price + highReg.slope * upperBarsAhead;
  const projectedLower = lowerLast.price + lowReg.slope * lowerBarsAhead;
  const upperTo = { time: lineEndTime, price: projectedUpper };
  const lowerTo = { time: lineEndTime, price: projectedLower };

  const touchScore = Math.min(20, (highs.length + lows.length - 4) * 5);
  const fitScore = Math.min(15, Math.round(((highReg.r2 + lowReg.r2) / 2) * 15));
  const compressionScore = Math.min(15, Math.round((1 - spread / Math.max(earlySpread, atr)) * 15));
  const urgencyScore = Math.min(10, Math.round(10 / Math.max(1, apexBarsAhead / 8)));
  const quality = clampQuality(62 + touchScore + fitScore + compressionScore + urgencyScore);

  const status = spread < atr * 1.8 ? 'confirmed' : 'forming';

  const allPrices = [...highs.map(h => h.price), ...lows.map(l => l.price)];
  const priceMin = Math.min(...allPrices) - atr * 0.3;
  const priceMax = Math.max(...allPrices) + atr * 0.3;

  const geometry: PatternGeometry = {
    anchorTimeFrom: fromTime,
    anchorTimeTo: extendedToTime,
    priceMin,
    priceMax,
    pivots: [...highsByTime, ...lowsByTime]
      .map(p => ({ time: p.time, price: p.price }))
      .sort((a, b) => a.time - b.time),
    lines: [
      { kind: 'segment', points: [upperFrom, upperTo] as [{ time: number; price: number }, { time: number; price: number }] },
      { kind: 'segment', points: [lowerFrom, lowerTo] as [{ time: number; price: number }, { time: number; price: number }] },
    ],
    zones: [],
  };

  return [{
    id: buildSetupId(symbol, timeframe, 'triangle', fromTime, lastPivotTime, (highs[0]!.price + lows[0]!.price) / 2),
    exchange: 'binance',
    marketType: 'futures',
    symbol,
    timeframe,
    kind: 'triangle',
    status,
    quality,
    from: fromTime,
    to: lastPivotTime,
    geometry,
  }];
}
