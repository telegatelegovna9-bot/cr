import type {
  ScreenerFilters,
  ScreenerMetricKey,
  ScreenerSnapshotMetricId,
  ScreenerSnapshotRow,
} from '@crypto-screener/shared';

function metricValue(row: ScreenerSnapshotRow, key: ScreenerMetricKey, timeframe?: string): number | null {
  if (key === 'price') return row.price;
  if (key === 'spreadPct') return row.spreadPct ?? null;
  if (key === 'fundingPct') return row.fundingPct ?? null;
  if (key === 'oi') return row.oi ?? null;
  if (!timeframe) return null;

  const metricId = `${timeframe}.${key}` as ScreenerSnapshotMetricId;
  return row.metrics[metricId] ?? null;
}

export function rowMatchesFilters(row: ScreenerSnapshotRow, filters: ScreenerFilters): boolean {
  if (filters.exchanges.length > 0 && !filters.exchanges.includes(row.exchange)) {
    return false;
  }

  for (const [key, range] of Object.entries(filters.metrics) as Array<[ScreenerMetricKey, ScreenerFilters['metrics'][ScreenerMetricKey]]>) {
    if (!range) continue;

    const value = metricValue(row, key, range.timeframe);
    if (value === null) return false;
    if (typeof range.min === 'number' && value < range.min) return false;
    if (typeof range.max === 'number' && value > range.max) return false;
  }

  return true;
}
