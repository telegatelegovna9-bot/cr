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

/**
 * Detects if there is a time gap between the last candle and now.
 * Returns the range to fetch or null if no significant gap exists.
 */
export function detectGap(
  lastCandle: RawCandle | undefined,
  timeframe: string,
  thresholdMultiplier = 1.5,
): { startTime: number; endTime: number } | null {
  if (!lastCandle) return null;

  const lastTime = candleTime(lastCandle);
  if (!lastTime) return null;

  const now = Date.now();
  const timeframeMs = getTimeframeDurationMs(timeframe);
  const diff = now - lastTime;

  // If the gap is significantly larger than one candle, we need to fill it
  if (diff > timeframeMs * thresholdMultiplier) {
    return {
      startTime: lastTime + 1,
      endTime: now,
    };
  }

  return null;
}

function getTimeframeDurationMs(timeframe: string): number {
  const amount = parseInt(timeframe);
  const unit = timeframe.replace(String(amount), '');
  switch (unit) {
    case 'm': return amount * 60_000;
    case 'h': return amount * 3600_000;
    case 'd': return amount * 86400_000;
    case 'w': return amount * 604800_000;
    default: return 60_000;
  }
}

export function mergeChartHistory<T extends RawCandle>(older: T[], current: T[]): T[] {
  const byTime = new Map<number, T>();

  const normalizeTime = (t: number) => {
    // If time is in seconds (10 digits), convert to ms
    if (t < 10000000000) return t * 1000;
    return t;
  };

  for (const candle of older) {
    const time = candleTime(candle);
    if (time !== null) byTime.set(normalizeTime(time), candle);
  }

  for (const candle of current) {
    const time = candleTime(candle);
    if (time !== null) byTime.set(normalizeTime(time), candle);
  }

  return Array.from(byTime.values())
    .sort((a, b) => (candleTime(a) ?? 0) - (candleTime(b) ?? 0));
}
