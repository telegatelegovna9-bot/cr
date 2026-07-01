import type { ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import type { ScreenerSnapshotBucket } from './screener.types.ts';
import { buildScreenerSnapshotRow } from './screener.metrics.ts';

export class ScreenerService {
  private readonly snapshots = new Map<ScreenerMarketType, ScreenerSnapshotRow[]>();
  private readonly updatedAt = new Map<ScreenerMarketType, number>();

  updateSnapshot(marketType: ScreenerMarketType, rows: ScreenerSnapshotRow[]): void {
    const bucketRows = rows
      .filter(row => row.marketType === marketType)
      .map(row => this.cloneRow(row));

    this.snapshots.set(marketType, bucketRows);
    this.updatedAt.set(marketType, Date.now());
  }

  listSnapshot(marketType: ScreenerMarketType): ScreenerSnapshotBucket {
    return {
      marketType,
      updatedAt: this.updatedAt.get(marketType) ?? 0,
      rows: (this.snapshots.get(marketType) ?? []).map(row => this.cloneRow(row)),
    };
  }

  readonly buildRow = buildScreenerSnapshotRow;

  private cloneRow(row: ScreenerSnapshotRow): ScreenerSnapshotRow {
    return {
      ...row,
      metrics: { ...row.metrics },
    };
  }
}
