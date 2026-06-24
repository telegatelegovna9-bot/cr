export interface RangeMetricPoint {
  time: number;
  price: number;
}

export interface RangeMetricCandle {
  time: number;
  volume?: number;
}

/**
 * `startTime`, `endTime`, and `timeMs` describe the loaded candle overlap inside
 * the selected range when in-range candles exist; otherwise they fall back to
 * the raw selected range bounds.
 */
export interface RangeMetrics {
  priceDelta: number;
  percentDelta: number;
  bars: number;
  timeMs: number;
  volume: number;
  startTime: number;
  endTime: number;
}

export function calculateRangeMetrics(
  input: { p1: RangeMetricPoint; p2: RangeMetricPoint },
  candles: RangeMetricCandle[],
): RangeMetrics {
  const rangeStartTime = Math.min(input.p1.time, input.p2.time);
  const rangeEndTime = Math.max(input.p1.time, input.p2.time);
  const priceDelta = input.p2.price - input.p1.price;
  const percentDelta = input.p1.price === 0 ? 0 : (priceDelta / input.p1.price) * 100;
  let bars = 0;
  let volume = 0;
  let overlapStartTime: number | null = null;
  let overlapEndTime: number | null = null;

  for (const candle of candles) {
    if (candle.time < rangeStartTime || candle.time > rangeEndTime) continue;

    bars += 1;
    volume += candle.volume ?? 0;
    overlapStartTime =
      overlapStartTime === null ? candle.time : Math.min(overlapStartTime, candle.time);
    overlapEndTime =
      overlapEndTime === null ? candle.time : Math.max(overlapEndTime, candle.time);
  }

  const startTime = overlapStartTime ?? rangeStartTime;
  const endTime = overlapEndTime ?? rangeEndTime;

  return {
    priceDelta,
    percentDelta,
    bars,
    timeMs: Math.max(0, endTime - startTime) * 1000,
    volume,
    startTime,
    endTime,
  };
}
