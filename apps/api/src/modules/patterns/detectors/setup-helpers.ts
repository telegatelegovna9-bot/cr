import { createHash } from 'node:crypto';
import type { PatternGeometry, PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { computeATR, extractSwingPivots, type SwingPivot } from './detector.utils';

export type SetupDirection = 'bullish' | 'bearish';

export interface LevelCandidate {
  pivot: SwingPivot;
  level: number;
  touches: number;
}

export interface SetupTimeframeConfig {
  pivotMultiplier: number;
  minTouches: number;
  minLevelAgeBars: number;
  levelLookbackPivots: number;
  compressionBars: number;
  maxCompressionAtr: number;
  minVolumeFactor: number;
  breakoutTravelAtr: number;
}

export function getSetupTimeframeConfig(timeframe: PatternTimeframe): SetupTimeframeConfig {
  switch (timeframe) {
    case '5m':
      return {
        pivotMultiplier: 2.2,
        minTouches: 5,
        minLevelAgeBars: 18,
        levelLookbackPivots: 18,
        compressionBars: 10,
        maxCompressionAtr: 2.2,
        minVolumeFactor: 1.18,
        breakoutTravelAtr: 1.6,
      };
    case '15m':
      return {
        pivotMultiplier: 1.75,
        minTouches: 4,
        minLevelAgeBars: 12,
        levelLookbackPivots: 14,
        compressionBars: 8,
        maxCompressionAtr: 2.8,
        minVolumeFactor: 1.05,
        breakoutTravelAtr: 2.1,
      };
    case '1h':
    default:
      return {
        pivotMultiplier: 1.45,
        minTouches: 3,
        minLevelAgeBars: 8,
        levelLookbackPivots: 12,
        compressionBars: 6,
        maxCompressionAtr: 3.2,
        minVolumeFactor: 1,
        breakoutTravelAtr: 2.6,
      };
  }
}

export function buildSetupId(
  symbol: string,
  timeframe: PatternTimeframe,
  kind: PatternCandidate['kind'],
  anchorTimeFrom: number,
  anchorTimeTo: number,
  level: number,
): string {
  const digest = createHash('sha1')
    .update(`${symbol}|${timeframe}|${kind}|${anchorTimeFrom}|${anchorTimeTo}|${level.toFixed(8)}`)
    .digest('hex');
  const hex = digest.slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16] ?? '0', 16) % 4]!;
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

export function getAtrAndPivots(candles: DetectorCandle[], pivotMultiplier = 1.4): {
  atr: number;
  pivots: SwingPivot[];
} | null {
  const atr = computeATR(candles);
  if (atr <= 0) return null;

  const pivots = extractSwingPivots(candles, pivotMultiplier);
  if (pivots.length < 4) return null;

  return { atr, pivots };
}

export function getAverageVolume(candles: DetectorCandle[], length = 20): number {
  const recent = candles.slice(-length);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, candle) => sum + candle.volume, 0) / recent.length;
}

export function buildHorizontalGeometry(args: {
  candles: DetectorCandle[];
  fromTime: number;
  toTime: number;
  level: number;
  points?: Array<{ time: number; price: number }>;
  atr: number;
}): PatternGeometry {
  const { candles, fromTime, toTime, level, points = [], atr } = args;
  const localSlice = candles.filter(candle => candle.time >= fromTime && candle.time <= toTime);
  const effectiveSlice = localSlice.length > 0 ? localSlice : candles.slice(-20);
  const low = Math.min(...effectiveSlice.map(candle => candle.low));
  const high = Math.max(...effectiveSlice.map(candle => candle.high));

  return {
    anchorTimeFrom: fromTime,
    anchorTimeTo: toTime,
    priceMin: low,
    priceMax: high,
    pivots: points,
    lines: [
      {
        kind: 'segment' as const,
        points: [
          { time: fromTime, price: level },
          { time: toTime, price: level },
        ] as [{ time: number; price: number }, { time: number; price: number }],
      },
    ],
    zones: [
      {
        fromTime,
        toTime,
        low: level - atr * 0.25,
        high: level + atr * 0.25,
      },
    ],
  };
}

export function countTouches(
  pivots: SwingPivot[],
  level: number,
  kind: SwingPivot['kind'],
  tolerance: number,
): number {
  return pivots.filter(pivot => pivot.kind === kind && Math.abs(pivot.price - level) <= tolerance).length;
}

export function getRecentLevelCandidates(
  pivots: SwingPivot[],
  kind: SwingPivot['kind'],
  tolerance: number,
  limit = 4,
  lookback = 10,
): LevelCandidate[] {
  const source = pivots.filter(pivot => pivot.kind === kind).slice(-lookback);
  const levels: LevelCandidate[] = [];

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const pivot = source[index]!;
    const duplicate = levels.find(level => Math.abs(level.level - pivot.price) <= tolerance);
    if (duplicate) continue;

    levels.push({
      pivot,
      level: pivot.price,
      touches: countTouches(pivots, pivot.price, kind, tolerance),
    });
  }

  return levels
    .sort((a, b) => {
      if (a.touches !== b.touches) return b.touches - a.touches;
      return b.pivot.time - a.pivot.time;
    })
    .slice(0, limit);
}

export function getBarsSince(candles: DetectorCandle[], time: number): number {
  const index = candles.findIndex(candle => candle.time === time);
  if (index < 0) return candles.length;
  return candles.length - 1 - index;
}

export function getCurrentVolumeFactor(candles: DetectorCandle[]): number {
  const avg = getAverageVolume(candles);
  if (avg <= 0) return 1;
  return candles[candles.length - 1]!.volume / avg;
}
