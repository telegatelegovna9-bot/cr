import type { ExchangeId } from '@crypto-screener/shared';
import { DEFAULT_SYMBOLS } from '@crypto-screener/shared';

export const SCREENER_UNIVERSE_SYMBOLS = DEFAULT_SYMBOLS;

export const SCREENER_PREFERRED_EXCHANGES: ExchangeId[] = [
  'binance',
  'bybit',
  'okx',
  'hyperliquid',
  'coinbase',
];

export const SCREENER_SUPPORTED_EXCHANGES = new Set<ExchangeId>(SCREENER_PREFERRED_EXCHANGES);

export const SCREENER_SAMPLE_INTERVAL_MS = 15_000;
export const SCREENER_COMPUTE_INTERVAL_MS = 15_000;
export const SCREENER_OI_POLL_INTERVAL_MS = 60_000;
export const SCREENER_TAKER_POLL_INTERVAL_MS = 60_000;
export const SCREENER_RETENTION_MS = 20 * 60 * 1000;

export const SCREENER_VOLUME_SPIKE_MIN_RATIO = 2.5;
export const SCREENER_BREAKOUT_MIN_PCT = 4;
export const SCREENER_MOMENTUM_MIN_PCT_1M = 2.5;
export const SCREENER_MOMENTUM_MIN_PCT_5M = 5;
export const SCREENER_OI_BUILD_MIN_PCT = 3;
export const SCREENER_TAKER_IMBALANCE_HIGH = 1.35;
export const SCREENER_TAKER_IMBALANCE_LOW = 0.75;
