export type ScreenerMarketType = 'spot' | 'futures';

export type ScreenerMetricKey =
  | 'changePct'
  | 'trades'
  | 'turnover'
  | 'natrPct'
  | 'spreadPct'
  | 'fundingPct'
  | 'volumeSpikePct'
  | 'tradesSpikePct'
  | 'oiChangePct'
  | 'oi'
  | 'deltaVolumePct'
  | 'deltaVolume'
  | 'price';

export type ScreenerTimeframeMetricKey =
  | 'changePct'
  | 'trades'
  | 'turnover'
  | 'natrPct'
  | 'volumeSpikePct'
  | 'tradesSpikePct'
  | 'oiChangePct'
  | 'deltaVolumePct'
  | 'deltaVolume';

export interface ScreenerMetricRange {
  min?: number;
  max?: number;
  timeframe?: string;
}

export interface ScreenerFilters {
  exchanges: string[];
  metrics: Partial<Record<ScreenerMetricKey, ScreenerMetricRange>>;
}

export interface ScreenerSnapshotRow {
  symbol: string;
  exchange: string;
  marketType: ScreenerMarketType;
  price: number;
  spreadPct?: number | null;
  fundingPct?: number | null;
  oi?: number | null;
  updatedAt: number;
  metrics: Record<string, number | null>;
}
