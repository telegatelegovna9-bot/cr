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

// For resistance: no candle HIGH should close significantly above the line.
// For support: no candle LOW should close significantly below the line.
// Using high/low (not close) matches how trendlines actually work on charts.
function isTrendlineIntact(
  candles: DetectorCandle[],
  fromTime: number,
  toTime: number,
  kind: 'resistance' | 'support',
  x1: number, y1: number,
  x2: number, y2: number,
  violationTolerance: number,
): boolean {
  for (const candle of candles) {
    if (candle.time < fromTime || candle.time > toTime) continue;
    const lineValue = projectLineAtX(x1, y1, x2, y2, candle.time);
    if (lineValue == null) continue;
    if (kind === 'resistance' && candle.high > lineValue + violationTolerance) return false;
    if (kind === 'support' && candle.low < lineValue - violationTolerance) return false;
  }
  return true;
}

function detectResistance(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  atr: number,
): PatternCandidate | null {
  // Stricter multiplier — only structural swing highs
  const pivots = extractSwingPivots(candles, 2.0);
  const highs = pivots.filter(p => p.kind === 'high');
  if (highs.length < 3) return null;

  const touchTol = atr * 0.4;
  const violTol = atr * 0.5;
  let best: PatternCandidate | null = null;

  for (let i = 0; i < highs.length - 2; i++) {
    for (let j = highs.length - 1; j > i + 1; j--) {
      const h1 = highs[i]!;
      const h2 = highs[j]!;

      // Must be descending
      if (h2.price >= h1.price) continue;
      // Minimum span
      if (h2.candleIndex - h1.candleIndex < 15) continue;
      // Minimum total drop
      if (h1.price - h2.price < atr * 1.5) continue;

      // Collect all highs that land within touchTol of this line
      const touching = highs.filter(h => {
        const lineVal = projectLineAtX(h1.time, h1.price, h2.time, h2.price, h.time);
        if (lineVal == null) return false;
        // Touch is measured against the high (wick touching the line)
        return Math.abs(h.price - lineVal) <= touchTol;
      });

      if (touching.length < 3) continue;

      // All candle highs between the first and last touch must respect the line
      const intact = isTrendlineIntact(
        candles,
        h1.time, h2.time,
        'resistance',
        h1.time, h1.price, h2.time, h2.price,
        violTol,
      );
      if (!intact) continue;

      // Line must still be unbroken right now
      const lastCandle = candles[candles.length - 1]!;
      const projectedNow = projectLineAtX(h1.time, h1.price, h2.time, h2.price, lastCandle.time);
      if (projectedNow == null) continue;
      // If price is already too far below the line — stale
      if (lastCandle.close < projectedNow - atr * 8) continue;
      // If price has already broken above — pattern done
      if (lastCandle.high > projectedNow + atr * 2) continue;

      // R² quality check
      const { r2 } = linearRegression(touching.map(h => ({ x: h.candleIndex, y: h.price })));
      if (r2 < 0.80) continue;

      // Last touch must be recent (in last 40% of pattern duration)
      const lastTouch = touching[touching.length - 1]!;
      const spanBars = h2.candleIndex - h1.candleIndex;
      const barsFromLastTouch = candles.length - 1 - lastTouch.candleIndex;
      if (barsFromLastTouch > spanBars * 0.6) continue;

      const totalDrop = h1.price - h2.price;
      const quality = clampQuality(
        56 +
        Math.min(14, touching.length * 5) +
        Math.min(10, Math.round(r2 * 10)) +
        Math.min(8, Math.round(spanBars / candles.length * 12)) +
        Math.min(8, Math.round((totalDrop / atr - 1.5) * 2)),
      );

      const spanMs = h2.time - h1.time;
      const extensionMs = Math.max(spanMs * 0.5, 5 * 60_000);
      const rayEndTime = h2.time + extensionMs;
      const rayEndPrice = projectLineAtX(h1.time, h1.price, h2.time, h2.price, rayEndTime) ?? h2.price;

      // Support lows in range (for display context)
      const lows = pivots.filter(
        p => p.kind === 'low' && p.candleIndex >= h1.candleIndex && p.candleIndex <= h2.candleIndex,
      );
      const allPivots = [...touching, ...lows].sort((a, b) => a.candleIndex - b.candleIndex);

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality,
        from: h1.time,
        to: h2.time,
        geometry: {
          anchorTimeFrom: h1.time,
          anchorTimeTo: h2.time,
          priceMin: Math.min(...candles.map(c => c.low)),
          priceMax: Math.max(...candles.map(c => c.high)),
          pivots: allPivots.map(p => ({ time: p.time, price: p.price })),
          lines: [{
            kind: 'ray',
            points: [
              { time: h1.time, price: h1.price },
              { time: rayEndTime, price: rayEndPrice },
            ],
          }],
          zones: [{
            fromTime: lastTouch.time,
            toTime: rayEndTime,
            low: Math.min(lastTouch.price, rayEndPrice) - touchTol * 0.6,
            high: Math.max(lastTouch.price, rayEndPrice) + touchTol * 0.2,
          }],
        },
      };

      if (!best || quality > best.quality) best = candidate;
    }
  }

  return best;
}

function detectSupport(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
  atr: number,
): PatternCandidate | null {
  const pivots = extractSwingPivots(candles, 2.0);
  const lows = pivots.filter(p => p.kind === 'low');
  if (lows.length < 3) return null;

  const touchTol = atr * 0.4;
  const violTol = atr * 0.5;
  let best: PatternCandidate | null = null;

  for (let i = 0; i < lows.length - 2; i++) {
    for (let j = lows.length - 1; j > i + 1; j--) {
      const l1 = lows[i]!;
      const l2 = lows[j]!;

      if (l2.price <= l1.price) continue;
      if (l2.candleIndex - l1.candleIndex < 15) continue;
      if (l2.price - l1.price < atr * 1.5) continue;

      const touching = lows.filter(l => {
        const lineVal = projectLineAtX(l1.time, l1.price, l2.time, l2.price, l.time);
        if (lineVal == null) return false;
        return Math.abs(l.price - lineVal) <= touchTol;
      });

      if (touching.length < 3) continue;

      const intact = isTrendlineIntact(
        candles,
        l1.time, l2.time,
        'support',
        l1.time, l1.price, l2.time, l2.price,
        violTol,
      );
      if (!intact) continue;

      const lastCandle = candles[candles.length - 1]!;
      const projectedNow = projectLineAtX(l1.time, l1.price, l2.time, l2.price, lastCandle.time);
      if (projectedNow == null) continue;
      if (lastCandle.close > projectedNow + atr * 8) continue;
      if (lastCandle.low < projectedNow - atr * 2) continue;

      const { r2 } = linearRegression(touching.map(l => ({ x: l.candleIndex, y: l.price })));
      if (r2 < 0.80) continue;

      const lastTouch = touching[touching.length - 1]!;
      const spanBars = l2.candleIndex - l1.candleIndex;
      const barsFromLastTouch = candles.length - 1 - lastTouch.candleIndex;
      if (barsFromLastTouch > spanBars * 0.6) continue;

      const totalRise = l2.price - l1.price;
      const quality = clampQuality(
        56 +
        Math.min(14, touching.length * 5) +
        Math.min(10, Math.round(r2 * 10)) +
        Math.min(8, Math.round(spanBars / candles.length * 12)) +
        Math.min(8, Math.round((totalRise / atr - 1.5) * 2)),
      );

      const spanMs = l2.time - l1.time;
      const extensionMs = Math.max(spanMs * 0.5, 5 * 60_000);
      const rayEndTime = l2.time + extensionMs;
      const rayEndPrice = projectLineAtX(l1.time, l1.price, l2.time, l2.price, rayEndTime) ?? l2.price;

      const highs = pivots.filter(
        p => p.kind === 'high' && p.candleIndex >= l1.candleIndex && p.candleIndex <= l2.candleIndex,
      );
      const allPivots = [...touching, ...highs].sort((a, b) => a.candleIndex - b.candleIndex);

      const candidate: PatternCandidate = {
        id: randomUUID(),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'trendline',
        status: 'forming',
        quality,
        from: l1.time,
        to: l2.time,
        geometry: {
          anchorTimeFrom: l1.time,
          anchorTimeTo: l2.time,
          priceMin: Math.min(...candles.map(c => c.low)),
          priceMax: Math.max(...candles.map(c => c.high)),
          pivots: allPivots.map(p => ({ time: p.time, price: p.price })),
          lines: [{
            kind: 'ray',
            points: [
              { time: l1.time, price: l1.price },
              { time: rayEndTime, price: rayEndPrice },
            ],
          }],
          zones: [{
            fromTime: lastTouch.time,
            toTime: rayEndTime,
            low: Math.min(lastTouch.price, rayEndPrice) - touchTol * 0.2,
            high: Math.max(lastTouch.price, rayEndPrice) + touchTol * 0.6,
          }],
        },
      };

      if (!best || quality > best.quality) best = candidate;
    }
  }

  return best;
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
  const r = detectResistance(symbol, timeframe, candles, atr);
  if (r) results.push(r);
  const s = detectSupport(symbol, timeframe, candles, atr);
  if (s) results.push(s);
  return results;
}
