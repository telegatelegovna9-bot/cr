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
  timeMs: number;
  volume: number;
  startTime: number;
  endTime: number;
}

export function calculateRangeMetrics(
  input: { p1: RangeMetricPoint; p2: RangeMetricPoint },
  candles: RangeMetricCandle[],
): RangeMetrics {
  const startTime = Math.min(input.p1.time, input.p2.time);
  const endTime = Math.max(input.p1.time, input.p2.time);
  const priceDelta = input.p2.price - input.p1.price;
  const percentDelta = input.p1.price === 0 ? 0 : (priceDelta / input.p1.price) * 100;
  const overlapping = candles.filter((candle) => candle.time >= startTime && candle.time <= endTime);
  const volume = overlapping.reduce((sum, candle) => sum + (candle.volume ?? 0), 0);

  return {
    priceDelta,
    percentDelta,
    bars: overlapping.length,
    timeMs: Math.max(0, endTime - startTime) * 1000,
    volume,
    startTime,
    endTime,
  };
}
