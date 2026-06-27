import type { ScreenerFilters, ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import { rowMatchesFilters } from './screener-filter-state.ts';

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
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
