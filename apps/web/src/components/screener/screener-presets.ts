import {
  ALL_EXCHANGES,
  SCREENER_MARKET_TYPES,
  SCREENER_METRIC_KEYS,
  TIMEFRAMES,
  type ExchangeId,
  type ScreenerFilters,
  type ScreenerMarketType,
  type ScreenerMetricKey,
  type ScreenerMetricRange,
  type Timeframe,
} from '@crypto-screener/shared';
import type { LocalScreenerPreset } from './screener-types.ts';

export function serializeScreenerPreset(preset: LocalScreenerPreset): string {
  return JSON.stringify(normalizeScreenerPreset(preset));
}

export function deserializeScreenerPreset(raw: string): LocalScreenerPreset | null {
  try {
    return normalizeScreenerPreset(JSON.parse(raw));
  } catch {
    return null;
  }
}

function normalizeScreenerPreset(input: unknown): LocalScreenerPreset | null {
  if (!isRecord(input)) return null;

  const id = asString(input.id);
  const name = asString(input.name);
  const marketType = asMarketType(input.marketType);
  const soundEnabled = typeof input.soundEnabled === 'boolean' ? input.soundEnabled : null;
  const createdAt = asNumber(input.createdAt);
  const updatedAt = asNumber(input.updatedAt);
  const filters = normalizeFilters(input.filters, input.exchanges);
  if (!id || !name || !marketType || soundEnabled === null || createdAt === null || updatedAt === null || !filters) {
    return null;
  }

  return {
    id,
    name,
    marketType,
    soundEnabled,
    filters,
    createdAt,
    updatedAt,
  };
}

function normalizeFilters(filtersValue: unknown, legacyExchangesValue: unknown): ScreenerFilters | null {
  if (!isRecord(filtersValue) || !isRecord(filtersValue.metrics)) return null;

  const exchanges = normalizeExchangeIds(filtersValue.exchanges) ?? normalizeExchangeIds(legacyExchangesValue);
  if (!exchanges) return null;

  const metrics: ScreenerFilters['metrics'] = {};
  for (const [rawKey, rawRange] of Object.entries(filtersValue.metrics)) {
    const key = asMetricKey(rawKey);
    const range = normalizeMetricRange(rawRange);
    if (!key || !range) return null;
    metrics[key] = range;
  }

  return { exchanges, metrics };
}

function normalizeMetricRange(value: unknown): ScreenerMetricRange | null {
  if (!isRecord(value)) return null;

  const min = value.min === undefined ? undefined : asNumber(value.min);
  const max = value.max === undefined ? undefined : asNumber(value.max);
  const timeframe = value.timeframe === undefined ? undefined : asTimeframe(value.timeframe);
  if ((value.min !== undefined && min === null) || (value.max !== undefined && max === null)) return null;
  if (value.timeframe !== undefined && !timeframe) return null;

  const range: ScreenerMetricRange = {};
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  if (timeframe !== undefined) range.timeframe = timeframe;
  return range;
}

function normalizeExchangeIds(value: unknown): ExchangeId[] | null {
  if (!Array.isArray(value)) return null;

  const exchanges = value
    .map(asExchangeId)
    .filter((exchange): exchange is ExchangeId => exchange !== null);

  if (exchanges.length !== value.length) return null;
  return Array.from(new Set(exchanges));
}

function asMarketType(value: unknown): ScreenerMarketType | null {
  return SCREENER_MARKET_TYPES.includes(value as ScreenerMarketType) ? (value as ScreenerMarketType) : null;
}

function asMetricKey(value: unknown): ScreenerMetricKey | null {
  return SCREENER_METRIC_KEYS.includes(value as ScreenerMetricKey) ? (value as ScreenerMetricKey) : null;
}

function asExchangeId(value: unknown): ExchangeId | null {
  return ALL_EXCHANGES.includes(value as ExchangeId) ? (value as ExchangeId) : null;
}

function asTimeframe(value: unknown): Timeframe | null {
  return TIMEFRAMES.includes(value as Timeframe) ? (value as Timeframe) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
