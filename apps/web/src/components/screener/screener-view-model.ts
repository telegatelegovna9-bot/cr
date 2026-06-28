import type { ScreenerFilters, ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import { rowMatchesFilters } from './screener-filter-state.ts';

const MAX_DISPLAY_ROWS = 150;

export interface ScreenerSnapshotViewModel {
  marketType: ScreenerMarketType;
  updatedAt: number;
  rows: ScreenerSnapshotRow[];
}

export function buildDisplayRows(input: {
  snapshot: ScreenerSnapshotViewModel;
  filters: ScreenerFilters;
}): ScreenerSnapshotRow[] {
  return input.snapshot.rows
    .filter(row => rowMatchesFilters(row, input.filters))
    .sort(compareDisplayRows)
    .slice(0, MAX_DISPLAY_ROWS);
}

function compareDisplayRows(a: ScreenerSnapshotRow, b: ScreenerSnapshotRow): number {
  const scoreDiff = signalScore(b) - signalScore(a);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return b.updatedAt - a.updatedAt;
}

function signalScore(row: ScreenerSnapshotRow): number {
  const volumeSpike = numericMetric(row, '1m.volumeSpikePct');
  const tradesSpike = numericMetric(row, '1m.tradesSpikePct');
  const deltaVolume = numericMetric(row, '1m.deltaVolume');
  const turnover = numericMetric(row, '1m.turnover');
  const changePct = Math.abs(numericMetric(row, '1m.changePct'));

  return (
    volumeSpike * 5 +
    tradesSpike * 3 +
    changePct * 2 +
    deltaVolume * 0.01 +
    turnover * 0.000001
  );
}

function numericMetric(row: ScreenerSnapshotRow, metricId: keyof ScreenerSnapshotRow['metrics']): number {
  const value = row.metrics[metricId];
  return typeof value === 'number' ? value : 0;
}
