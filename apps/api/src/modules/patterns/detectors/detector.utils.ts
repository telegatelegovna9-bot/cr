import type {
  DetectorCandle,
  DetectorPivotCandle,
  PatternCandidate,
} from './detector.types';

export function clampQuality(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function toPivotWindow(candles: DetectorCandle[]): DetectorPivotCandle[] {
  return candles.map((candle, index) => ({ ...candle, index }));
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

  if (union <= 0) {
    return false;
  }

  return intersection / union >= 0.7;
}
