import { Injectable } from '@nestjs/common';
import type { ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import type { ScreenerSnapshotBucket } from './screener.types.ts';
import { buildScreenerSnapshotRow } from './screener.metrics.ts';

@Injectable()
export class ScreenerService {
  private readonly snapshots = new Map<ScreenerMarketType, ScreenerSnapshotRow[]>();
  private readonly updatedAt = new Map<ScreenerMarketType, number>();

  updateSnapshot(marketType: ScreenerMarketType, rows: ScreenerSnapshotRow[]): void {
    this.snapshots.set(marketType, rows);
    this.updatedAt.set(marketType, Date.now());
  }

  listSnapshot(marketType: ScreenerMarketType): ScreenerSnapshotBucket {
    return {
      marketType,
      updatedAt: this.updatedAt.get(marketType) ?? 0,
      rows: this.snapshots.get(marketType) ?? [],
    };
  }

  readonly buildRow = buildScreenerSnapshotRow;
}
