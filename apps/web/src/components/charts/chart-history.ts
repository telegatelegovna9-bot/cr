type RawCandle = {
  time?: number;
  timestamp?: number;
  [key: string]: unknown;
};

function candleTime(candle: RawCandle): number | null {
  const time = candle.time ?? candle.timestamp;
  return typeof time === 'number' && Number.isFinite(time) ? time : null;
}

export function shouldBackfillInitialHistory(raw: RawCandle[], targetCount: number): boolean {
  return raw.length > 0 && raw.length < targetCount;
}

export function getInitialHistoryBackfillEndTime(raw: RawCandle[]): number | null {
  const times = raw
    .map(candleTime)
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);

  return times.length ? times[0] - 1 : null;
}

export function mergeChartHistory<T extends RawCandle>(older: T[], current: T[]): T[] {
  const byTime = new Map<number, T>();

  for (const candle of older) {
    const time = candleTime(candle);
    if (time !== null) byTime.set(time, candle);
  }

  for (const candle of current) {
    const time = candleTime(candle);
    if (time !== null) byTime.set(time, candle);
  }

  return Array.from(byTime.values()).sort((a, b) => (candleTime(a) ?? 0) - (candleTime(b) ?? 0));
}
