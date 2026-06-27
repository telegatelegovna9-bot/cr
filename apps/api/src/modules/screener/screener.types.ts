import type {
  ExchangeId,
  ScreenerMarketType,
  ScreenerSnapshotMetricId,
  ScreenerSnapshotRow,
} from '@crypto-screener/shared';

export interface ScreenerFeatureMap extends Partial<Record<ScreenerSnapshotMetricId, number | null>> {}

export interface BuildScreenerSnapshotRowInput {
  ticker: {
    exchange: ExchangeId;
    marketType: ScreenerMarketType;
    symbol: string;
    lastPrice: number;
    timestamp: number;
    priceChangePercent24h?: number;
    volume24h?: number;
  };
  featureMap: ScreenerFeatureMap;
  spreadPct?: number | null;
  fundingPct?: number | null;
  oi?: number | null;
}

export interface ScreenerSnapshotBucket {
  marketType: ScreenerMarketType;
  updatedAt: number;
  rows: ScreenerSnapshotRow[];
}
