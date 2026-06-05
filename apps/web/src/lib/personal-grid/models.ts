import type { Timeframe } from '@crypto-screener/shared';

export type PersonalGridLayout = 1 | 4 | 6;

export type PersonalGridMarketType = 'spot' | 'futures';

export interface PersonalGridSlotConfig {
  id: string;
  symbol: string | null;
  exchange: string | null;
  marketType: PersonalGridMarketType | null;
  timeframe: Timeframe | null;
}

export interface PersonalGridState {
  layout: PersonalGridLayout;
  slots: PersonalGridSlotConfig[];
  expandedSlotId: string | null;
}

export function createEmptyPersonalGridState(): PersonalGridState {
  return {
    layout: 4,
    expandedSlotId: null,
    slots: Array.from({ length: 6 }, (_, index) => ({
      id: `slot-${index + 1}`,
      symbol: null,
      exchange: null,
      marketType: null,
      timeframe: null,
    })),
  };
}

export const DEFAULT_PERSONAL_GRID_STATE = createEmptyPersonalGridState();
