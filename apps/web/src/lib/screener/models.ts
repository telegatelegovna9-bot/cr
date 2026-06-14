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

export function formatScreenerPercent(value: number | null): string {
  if (value === null) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatScreenerNumber(value: number | null): string {
  if (value === null) return 'n/a';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatScreenerPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}
