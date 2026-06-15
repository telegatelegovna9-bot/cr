import { clampQuality, computeATR, extractStructuralPivots } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe, PatternGeometry } from '../patterns.types';
import { buildSetupId } from './setup-helpers';

function linReg(xVals: number[], yVals: number[]): { slope: number; intercept: number; r2: number } {
  const n = xVals.length;
  if (n < 2) return { slope: 0, intercept: yVals[0] ?? 0, r2: 0 };
  const sx = xVals.reduce((a, b) => a + b, 0);
  const sy = yVals.reduce((a, b) => a + b, 0);
  const sxy = xVals.reduce((a, x, i) => a + x * yVals[i]!, 0);
  const sxx = xVals.reduce((a, x) => a + x * x, 0);
  const d = n * sxx - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  const sst = yVals.reduce((s, y) => s + (y - mean) ** 2, 0);
  const sse = yVals.reduce((s, y, i) => s + (y - (slope * xVals[i]! + intercept)) ** 2, 0);
  return { slope, intercept, r2: sst === 0 ? 1 : Math.max(0, 1 - sse / sst) };
}

export function detectWedgeSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 60) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const pivotMult = timeframe === '1d' ? 1.2 : timeframe === '4h' ? 1.3 : 1.5;
  const pivots = extractStructuralPivots(candles, pivotMult);

  const highs = pivots.filter(p => p.kind === 'high').slice(-5);
  const lows = pivots.filter(p => p.kind === 'low').slice(-5);

  if (highs.length < 2 || lows.length < 2) return [];

  const current = candles[candles.length - 1]!;
  const currentIdx = candles.length - 1;

  const highReg = linReg(highs.map(h => h.candleIndex), highs.map(h => h.price));
  const lowReg = linReg(lows.map(l => l.candleIndex), lows.map(l => l.price));

  const projHigh = highReg.intercept + highReg.slope * currentIdx;
  const projLow = lowReg.intercept + lowReg.slope * currentIdx;

  // Price inside wedge
  if (current.close > projHigh + atr * 0.4 || current.close < projLow - atr * 0.4) return [];

  const spread = projHigh - projLow;
  if (spread <= 0 || spread > atr * 8) return [];

  // Regression quality
  if (highReg.r2 < 0.5 && lowReg.r2 < 0.5) return [];

  // Must converge — check spread is shrinking
  const earlyIdx = Math.max(0, currentIdx - 30);
  const earlySpread = (highReg.intercept + highReg.slope * earlyIdx) - (lowReg.intercept + lowReg.slope * earlyIdx);
  if (earlySpread <= spread + atr * 0.1) return [];

  const normHigh = highReg.slope / atr;
  const normLow = lowReg.slope / atr;
  const FLAT = 0.02;

  // Rising wedge: both slopes positive AND converging (highSlope < lowSlope)
  // Falling wedge: both slopes negative AND converging (highSlope > lowSlope)
  const isRisingWedge = normHigh > FLAT && normLow > FLAT && normHigh < normLow;
  const isFallingWedge = normHigh < -FLAT && normLow < -FLAT && normHigh > normLow;

  if (!isRisingWedge && !isFallingWedge) return [];

  const allPivotTimes = [...highs, ...lows].map(p => p.time);
  const fromTime = Math.min(...allPivotTimes);
  const lastPivotTime = Math.max(...allPivotTimes);
  const patternDuration = lastPivotTime - fromTime;
  const extendedToTime = lastPivotTime + patternDuration * 0.25;

  const upperFrom = { time: highs[0]!.time, price: highs[0]!.price };
  const upperTo = { time: extendedToTime, price: projHigh + highReg.slope * 5 };
  const lowerFrom = { time: lows[0]!.time, price: lows[0]!.price };
  const lowerTo = { time: extendedToTime, price: projLow + lowReg.slope * 5 };

  const touchScore = Math.min(16, (highs.length + lows.length - 4) * 4);
  const fitScore = Math.min(14, Math.round(((highReg.r2 + lowReg.r2) / 2) * 14));
  const compressionScore = Math.min(15, Math.round((1 - spread / Math.max(earlySpread, atr)) * 15));
  const quality = clampQuality(63 + touchScore + fitScore + compressionScore);

  const status = spread < atr * 1.5 ? 'confirmed' : 'forming';

  const allPrices = [...highs.map(h => h.price), ...lows.map(l => l.price)];
  const geometry: PatternGeometry = {
    anchorTimeFrom: fromTime,
    anchorTimeTo: extendedToTime,
    priceMin: Math.min(...allPrices) - atr * 0.3,
    priceMax: Math.max(...allPrices) + atr * 0.3,
    pivots: [
      ...highs.map(h => ({ time: h.time, price: h.price })),
      ...lows.map(l => ({ time: l.time, price: l.price })),
    ],
    lines: [
      { kind: 'ray', points: [upperFrom, upperTo] as [{ time: number; price: number }, { time: number; price: number }] },
      { kind: 'ray', points: [lowerFrom, lowerTo] as [{ time: number; price: number }, { time: number; price: number }] },
    ],
    zones: [{
      fromTime,
      toTime: lastPivotTime,
      low: projLow - atr * 0.1,
      high: projHigh + atr * 0.1,
    }],
  };

  return [{
    id: buildSetupId(symbol, timeframe, 'wedge', fromTime, lastPivotTime, (highs[0]!.price + lows[0]!.price) / 2),
    exchange: 'binance',
    marketType: 'futures',
    symbol,
    timeframe,
    kind: 'wedge',
    status,
    quality,
    from: fromTime,
    to: lastPivotTime,
    geometry,
  }];
}
