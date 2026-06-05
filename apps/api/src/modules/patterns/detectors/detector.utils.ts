import type {
  DetectorCandle,
  DetectorPivotCandle,
  PatternCandidate,
} from './detector.types';

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

export function extractSwingPivots(candles: DetectorCandle[]): SwingPivot[] {
  if (candles.length < 3) {
    return [];
  }

  const pivots: SwingPivot[] = [];
  let previousDirection: 'up' | 'down' | null = null;

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    const direction: 'up' | 'down' =
      current.close >= previous.close ? 'up' : 'down';

    if (previousDirection && direction !== previousDirection) {
      const pivotCandle = previous;
      pivots.push({
        kind: previousDirection === 'up' ? 'high' : 'low',
        time: pivotCandle.time,
        price: previousDirection === 'up' ? pivotCandle.high : pivotCandle.low,
        candleIndex: index - 1,
      });
    }

    previousDirection = direction;
  }

  const last = candles[candles.length - 1];
  pivots.push({
    kind: previousDirection === 'up' ? 'high' : 'low',
    time: last.time,
    price: previousDirection === 'up' ? last.high : last.low,
    candleIndex: candles.length - 1,
  });

  return pivots.filter((pivot, index, list) => {
    if (index === 0) return true;
    const prev = list[index - 1];
    return prev.kind !== pivot.kind;
  });
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
