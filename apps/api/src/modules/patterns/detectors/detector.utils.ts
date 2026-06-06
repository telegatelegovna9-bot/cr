import type {
  DetectorCandle,
  DetectorPivotCandle,
  PatternCandidate,
  PatternDetector,
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
  if (candles.length < 5) {
    return [];
  }

  const rawPivots: SwingPivot[] = [];
  const lookaround = candles.length < 16 ? 1 : 2;

  for (let index = lookaround; index < candles.length - lookaround; index += 1) {
    const current = candles[index];
    const neighbours = candles.slice(index - lookaround, index + lookaround + 1);
    const neighbourHighs = neighbours.map(candle => candle.high);
    const neighbourLows = neighbours.map(candle => candle.low);
    const isSwingHigh =
      current.high === Math.max(...neighbourHighs) &&
      current.high > Math.max(...neighbourHighs.filter((_, neighbourIndex) => neighbourIndex !== lookaround));
    const isSwingLow =
      current.low === Math.min(...neighbourLows) &&
      current.low < Math.min(...neighbourLows.filter((_, neighbourIndex) => neighbourIndex !== lookaround));

    if (isSwingHigh) {
      rawPivots.push({
        kind: 'high',
        time: current.time,
        price: current.high,
        candleIndex: index,
      });
    }

    if (isSwingLow) {
      rawPivots.push({
        kind: 'low',
        time: current.time,
        price: current.low,
        candleIndex: index,
      });
    }
  }

  rawPivots.sort((a, b) => a.candleIndex - b.candleIndex);

  const compressed: SwingPivot[] = [];
  for (const pivot of rawPivots) {
    const previous = compressed[compressed.length - 1];
    if (!previous) {
      compressed.push(pivot);
      continue;
    }

    if (previous.kind === pivot.kind) {
      const shouldReplace =
        pivot.kind === 'high' ? pivot.price > previous.price : pivot.price < previous.price;
      if (shouldReplace) {
        compressed[compressed.length - 1] = pivot;
      }
      continue;
    }

    compressed.push(pivot);
  }

  const priceMin = Math.min(...candles.map(candle => candle.low));
  const priceMax = Math.max(...candles.map(candle => candle.high));
  const minimumSwing = Math.max((priceMax - priceMin) * 0.04, 1e-10);
  const filtered: SwingPivot[] = [];

  for (const pivot of compressed) {
    const previous = filtered[filtered.length - 1];
    if (!previous) {
      filtered.push(pivot);
      continue;
    }

    if (Math.abs(pivot.price - previous.price) < minimumSwing) {
      continue;
    }

    filtered.push(pivot);
  }

  return filtered;
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
  if (tasks.length === 0) {
    return [];
  }

  const limit = Math.max(1, concurrency);
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= tasks.length) {
        return;
      }

      results[currentIndex] = await tasks[currentIndex]!();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}
