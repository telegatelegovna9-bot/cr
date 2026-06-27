import type { ScreenerFilters, ScreenerMarketType } from '@crypto-screener/shared';

export interface LocalScreenerPreset {
  id: string;
  name: string;
  marketType: ScreenerMarketType;
  soundEnabled: boolean;
  filters: ScreenerFilters;
  createdAt: number;
  updatedAt: number;
}
