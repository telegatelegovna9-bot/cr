import type { ExchangeId, Timeframe } from './types';

export const SCREENER_MARKET_TYPES = ['spot', 'futures'] as const;
export type ScreenerMarketType = (typeof SCREENER_MARKET_TYPES)[number];

export const SCREENER_METRIC_KEYS = [
  'changePct',
  'trades',
  'turnover',
  'natrPct',
  'spreadPct',
  'fundingPct',
  'volumeSpikePct',
  'tradesSpikePct',
  'oiChangePct',
  'oi',
  'deltaVolumePct',
  'deltaVolume',
  'price',
] as const;
export type ScreenerMetricKey = (typeof SCREENER_METRIC_KEYS)[number];

export const SCREENER_TIMEFRAME_METRIC_KEYS = [
  'changePct',
  'trades',
  'turnover',
  'natrPct',
  'volumeSpikePct',
  'tradesSpikePct',
  'oiChangePct',
  'deltaVolumePct',
  'deltaVolume',
] as const;
export type ScreenerTimeframeMetricKey = (typeof SCREENER_TIMEFRAME_METRIC_KEYS)[number];
export type ScreenerSnapshotMetricId = `${Timeframe}.${ScreenerTimeframeMetricKey}`;

export interface ScreenerMetricRange {
  min?: number;
  max?: number;
  timeframe?: Timeframe;
}

export interface ScreenerFilters {
  exchanges: ExchangeId[];
  metrics: Partial<Record<ScreenerMetricKey, ScreenerMetricRange>>;
}

export interface ScreenerSnapshotRow {
  symbol: string;
  exchange: ExchangeId;
  marketType: ScreenerMarketType;
  price: number;
  spreadPct?: number | null;
  fundingPct?: number | null;
  oi?: number | null;
  updatedAt: number;
  metrics: Partial<Record<ScreenerSnapshotMetricId, number | null>>;
}
