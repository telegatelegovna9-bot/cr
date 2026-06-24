export interface RangeMetricPoint {
  time: number;
  price: number;
}

export interface RangeMetricCandle {
  time: number;
  volume?: number;
}

export interface RangeMetrics {
  priceDelta: number;
  percentDelta: number;
  bars: number;
  volume: number;
  rangeStartTime: number;
  rangeEndTime: number;
  overlapStartTime: number | null;
  overlapEndTime: number | null;
  overlapTimeMs: number;
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

  return {
    priceDelta,
    percentDelta,
    bars,
    volume,
    rangeStartTime,
    rangeEndTime,
    overlapStartTime,
    overlapEndTime,
    overlapTimeMs:
      overlapStartTime === null || overlapEndTime === null
        ? 0
        : Math.max(0, overlapEndTime - overlapStartTime) * 1000,
  };
}
