import type { ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import { fetchApi } from '@/lib/api';

export interface ScreenerSnapshotResponse {
  success: true;
  data: {
    marketType: ScreenerMarketType;
    updatedAt: number;
    rows: ScreenerSnapshotRow[];
  };
}

export function getScreenerSnapshot(marketType: ScreenerMarketType): Promise<ScreenerSnapshotResponse> {
  return fetchApi<ScreenerSnapshotResponse>(`/screener/snapshot?marketType=${marketType}`);
}
