import type {
  ScreenerDetectorType,
  ScreenerEvent,
  ScreenerEventsResponse,
  ScreenerMode,
  ScreenerPromotionTier,
  ScreenerStrengthTier,
} from '@crypto-screener/shared';

export type {
  ScreenerDetectorType,
  ScreenerEvent,
  ScreenerEventsResponse,
  ScreenerMode,
  ScreenerPromotionTier,
  ScreenerStrengthTier,
};

export interface ScreenerEventListItem extends ScreenerEvent {
  setupLabel: string;
  freshnessMs: number;
}

export interface ScreenerEventDetailMetric {
  key: string;
  label: string;
  value: number | string | null;
}

export interface ScreenerEventDetailItem extends ScreenerEventListItem {
  whatChanged: string;
  whyFlagged: string;
  marketContext: ScreenerEventDetailMetric[];
}

export interface ScreenerEventListResponse {
  items: ScreenerEventListItem[];
  timestamp: number;
}

export interface ScreenerEventDetailResponse {
  item: ScreenerEventDetailItem | null;
  timestamp: number;
}

export interface ScreenerEventCounts {
  bestSetupsCount: number;
  spotCount: number;
  futuresCount: number;
  rareCount: number;
}

export interface ScreenerHealthState {
  tone: 'live' | 'stale' | 'waiting';
  label: string;
  detail: string;
}

const MODE_LABELS: Record<ScreenerMode, string> = {
  'best-setups': 'Best Setups',
  spot: 'Spot',
  futures: 'Futures',
};

const MODE_DESCRIPTIONS: Record<ScreenerMode, string> = {
  'best-setups': 'Curated market events with the clearest follow-through or dislocation.',
  spot: 'Cash-market events such as breakouts and cross-exchange pricing gaps.',
  futures: 'Derivatives events such as open-interest builds and squeeze risk.',
};

const DETECTOR_LABELS: Record<ScreenerDetectorType, string> = {
  'spot-breakout-pressure': 'Breakout Pressure',
  'spot-cross-exchange': 'Cross-Exchange Divergence',
  'futures-oi-build': 'OI Build Pressure',
  'futures-squeeze-risk': 'Squeeze Risk',
};

const PROMOTION_LABELS: Record<ScreenerPromotionTier, string> = {
  ignore: 'Background',
  watch: 'Watchlist',
  actionable: 'Needs Attention',
  rare: 'Rare Setup',
};

const STRENGTH_LABELS: Record<ScreenerStrengthTier, string> = {
  watching: 'Watching',
  actionable: 'Actionable',
  'high-risk': 'High Risk',
  'event-live': 'Event In Progress',
};

const METRIC_LABELS: Record<string, string> = {
  breakoutReferencePrice: 'Breakout reference price',
  breakoutRetentionMs: 'Breakout retention',
  compressionPct: 'Compression',
  deviationBps: 'Price gap',
  exchangeCount: 'Live exchanges',
  lastPrice: 'Last price',
  medianPrice: 'Median price',
  openInterestChangePct: 'Open interest change',
  openInterestNow: 'Open interest now',
  outlierPrice: 'Outlier price',
  priceChange5m: 'Price change (5m)',
  priceChange5mPct: 'Price change (5m)',
  takerBuyRatio: 'Taker buy ratio',
  volumeNow: 'Rolling quote volume',
  volumeSpikeRatio: 'Volume spike ratio',
};

export function parseScreenerMode(value: string): ScreenerMode {
  const normalizedValue = value.trim();
  return normalizedValue === 'spot' || normalizedValue === 'futures' || normalizedValue === 'best-setups'
    ? normalizedValue
    : 'best-setups';
}

export function screenerModeLabel(mode: ScreenerMode): string {
  return MODE_LABELS[mode];
}

export function screenerModeDescription(mode: ScreenerMode): string {
  return MODE_DESCRIPTIONS[mode];
}

export function screenerDetectorLabel(detectorType: ScreenerDetectorType): string {
  return DETECTOR_LABELS[detectorType];
}

export function screenerPromotionLabel(tier: ScreenerPromotionTier): string {
  return PROMOTION_LABELS[tier];
}

export function screenerStrengthLabel(tier: ScreenerStrengthTier): string {
  return STRENGTH_LABELS[tier];
}

export function screenerMetricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key;
}

export function deriveScreenerDetailFromEvent(
  event: ScreenerEvent | ScreenerEventListItem,
  now = Date.now(),
): ScreenerEventDetailItem {
  return {
    ...event,
    setupLabel: 'setupLabel' in event ? event.setupLabel : screenerDetectorLabel(event.detectorType),
    freshnessMs: 'freshnessMs' in event ? event.freshnessMs : Math.max(0, now - event.updatedAt),
    whatChanged: event.headline,
    whyFlagged: event.reason,
    marketContext: Object.entries(event.supportingMetrics).map(([key, value]) => ({
      key,
      label: screenerMetricLabel(key),
      value,
    })),
  };
}

export function getScreenerHealthState(
  health: ScreenerHealth | null,
  now = Date.now(),
): ScreenerHealthState {
  if (!health?.lastComputedAt) {
    return {
      tone: 'waiting',
      label: 'Waiting',
      detail: 'No screener snapshot yet',
    };
  }

  const snapshotAgeMs = Math.max(0, now - health.lastComputedAt);
  const hasStaleSource = Object.values(health.sources).some(source => source.status === 'stale');

  if (snapshotAgeMs >= 3 * 60_000 || hasStaleSource) {
    return {
      tone: 'stale',
      label: 'Stale',
      detail: 'Backend snapshot is delayed',
    };
  }

  return {
    tone: 'live',
    label: 'Live',
    detail: 'Updated moments ago',
  };
}

export function getScreenerEndpoint(mode: ScreenerMode): `/api/screener/${ScreenerMode}` {
  return `/api/screener/${mode}`;
}

export function getScreenerDetailEndpoint(id: string): string {
  return `/api/screener/detail/${encodeURIComponent(id)}`;
}

// Temporary compatibility for untouched row-based UI code outside Task 1.
export type ScreenerMarketType = 'spot' | 'futures';

export type ScreenerState =
  | 'Momentum'
  | 'Breakout Watch'
  | 'OI Build'
  | 'OI Unwind'
  | 'Volume Expansion'
  | 'Short Squeeze Risk'
  | 'Long Liquidation Risk';

export type ScreenerConviction = 'watch' | 'strong' | 'extreme';

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
  range15mPct: number;
  volumeNow: number;
  volumeAvg: number;
  volumeSpikeRatio: number;
  openInterestNow: number | null;
  openInterestChangePct: number | null;
  takerBuyRatio: number | null;
  liquidationUsd: number | null;
  compressionBreakout: boolean;
  conviction: ScreenerConviction;
  score: number;
  state: ScreenerState | null;
  reasons: string[];
  updatedAt: number;
}

export interface ScreenerSummary {
  totalRows: number;
  momentumCount: number;
  breakoutWatchCount: number;
  compressionBreakoutCount: number;
  oiBuildCount: number;
  volumeExpansionCount: number;
  shortSqueezeRiskCount: number;
  longLiquidationRiskCount: number;
  averageScore: number;
  universeSize: number;
}

export interface ScreenerCompatibleSummary extends ScreenerSummary {
  eventCounts: ScreenerEventCounts;
}

export interface ScreenerHealth {
  lastComputedAt: number | null;
  universeSize: number;
  sources: Record<string, { lastSeenAt: number | null; status: 'idle' | 'live' | 'stale' }>;
}

export interface ScreenerCompatibleSummaryResponse {
  summary: ScreenerCompatibleSummary;
  timestamp: number;
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

export function formatScreenerMetricValue(key: string, value: number | string | null): string {
  if (value === null) return 'n/a';
  if (typeof value === 'string') return value;

  switch (key) {
    case 'breakoutReferencePrice':
    case 'lastPrice':
    case 'medianPrice':
    case 'outlierPrice':
      return formatScreenerPrice(value);
    case 'breakoutRetentionMs':
      return `${Math.round(value / 1000)}s`;
    case 'compressionPct':
    case 'openInterestChangePct':
    case 'priceChange5m':
    case 'priceChange5mPct':
      return formatScreenerPercent(value);
    case 'deviationBps':
      return `${value.toFixed(0)} bps`;
    case 'exchangeCount':
      return `${Math.round(value)}`;
    case 'openInterestNow':
    case 'volumeNow':
      return formatScreenerNumber(value);
    case 'takerBuyRatio':
    case 'volumeSpikeRatio':
      return `${value.toFixed(2)}x`;
    default:
      return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }
}

export function formatScreenerFreshness(freshnessMs: number): string {
  if (freshnessMs < 15_000) return 'just now';
  if (freshnessMs < 60_000) return '<1m ago';
  if (freshnessMs < 60 * 60_000) return `${Math.round(freshnessMs / 60_000)}m ago`;
  return `${Math.round(freshnessMs / 3_600_000)}h ago`;
}
