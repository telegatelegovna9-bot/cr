import type { ExchangeId, ScreenerFilters, ScreenerMarketType } from '@crypto-screener/shared';

export interface LocalScreenerPreset {
  id: string;
  name: string;
  marketType: ScreenerMarketType;
  exchanges: ExchangeId[];
  soundEnabled: boolean;
  filters: ScreenerFilters;
  createdAt: number;
  updatedAt: number;
}
