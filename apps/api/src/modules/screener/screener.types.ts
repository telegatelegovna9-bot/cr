export type ScreenerMarketType = 'spot' | 'futures';

export type ScreenerState =
  | 'Momentum'
  | 'Breakout Watch'
  | 'OI Build'
  | 'OI Unwind'
  | 'Volume Expansion'
  | 'Short Squeeze Risk'
  | 'Long Liquidation Risk';

export interface ScreenerRow {
  id: string;
  symbol: string;
  baseAsset: string;
  marketType: ScreenerMarketType;
  primaryExchange: string;
  lastPrice: number;
  priceChange1m: number;
  priceChange5m: number;
  priceChange15m: number;
  volumeNow: number;
  volumeAvg: number;
  volumeSpikeRatio: number;
  openInterestNow: number | null;
  openInterestChangePct: number | null;
  takerBuyRatio: number | null;
  liquidationUsd: number | null;
  score: number;
  state: ScreenerState | null;
  reasons: string[];
  updatedAt: number;
}

export interface ScreenerSummary {
  totalRows: number;
  momentumCount: number;
  breakoutWatchCount: number;
  oiBuildCount: number;
  volumeExpansionCount: number;
  shortSqueezeRiskCount: number;
  longLiquidationRiskCount: number;
  averageScore: number;
  universeSize: number;
}

export interface ScreenerHealth {
  lastComputedAt: number | null;
  universeSize: number;
  sources: Record<string, { lastSeenAt: number | null; status: 'idle' | 'live' | 'stale' }>;
}

export interface ScreenerFeedResponse {
  items: ScreenerRow[];
  timestamp: number;
}

export interface ScreenerSummaryResponse {
  summary: ScreenerSummary;
  timestamp: number;
}

export interface ScreenerHealthResponse {
  health: ScreenerHealth;
  timestamp: number;
}
