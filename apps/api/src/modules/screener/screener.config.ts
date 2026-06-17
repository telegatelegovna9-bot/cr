import type { ExchangeId } from '@crypto-screener/shared';
import { DEFAULT_SYMBOLS } from '@crypto-screener/shared';

export function toScreenerFuturesSymbol(symbol: string): string {
  const [base, quote] = symbol.split('/');
  if (!base || !quote || symbol.includes(':')) return symbol;
  return `${base}/${quote}:${quote}`;
}

export const SCREENER_SPOT_UNIVERSE_SYMBOLS = DEFAULT_SYMBOLS;
export const SCREENER_FUTURES_UNIVERSE_SYMBOLS = DEFAULT_SYMBOLS.map(toScreenerFuturesSymbol);
export const SCREENER_UNIVERSE_SYMBOLS = [
  ...SCREENER_SPOT_UNIVERSE_SYMBOLS,
  ...SCREENER_FUTURES_UNIVERSE_SYMBOLS,
];

export const SCREENER_PREFERRED_EXCHANGES: ExchangeId[] = [
  'binance',
  'bybit',
  'okx',
  'hyperliquid',
  'coinbase',
];

export const SCREENER_SPOT_DETECTOR_EXCHANGES = ['binance', 'okx', 'bybit'] as const;
export const SCREENER_FUTURES_DETECTOR_EXCHANGES = ['binance', 'okx', 'bybit'] as const;
export const SCREENER_SUPPORTED_EXCHANGES = new Set<ExchangeId>([
  ...SCREENER_PREFERRED_EXCHANGES,
  ...SCREENER_SPOT_DETECTOR_EXCHANGES,
  ...SCREENER_FUTURES_DETECTOR_EXCHANGES,
]);

export const SCREENER_SAMPLE_INTERVAL_MS = 15_000;
export const SCREENER_COMPUTE_INTERVAL_MS = 15_000;
export const SCREENER_OI_POLL_INTERVAL_MS = 60_000;
export const SCREENER_TAKER_POLL_INTERVAL_MS = 60_000;
export const SCREENER_RETENTION_MS = 20 * 60 * 1000;
export const SCREENER_BEST_SETUPS_LIMIT = 8;
export const SCREENER_BREAKOUT_RETENTION_MS = 90_000;
export const SCREENER_DIVERGENCE_MIN_BPS = 35;
export const SCREENER_DIVERGENCE_WATCH_BPS = 12;

export const SCREENER_VOLUME_SPIKE_MIN_RATIO = 2.5;
export const SCREENER_VOLUME_SPIKE_WATCH_RATIO = 1.35;
export const SCREENER_BREAKOUT_MIN_PCT = 4;
export const SCREENER_BREAKOUT_WATCH_MIN_PCT = 1.2;
export const SCREENER_MOMENTUM_MIN_PCT_1M = 2.5;
export const SCREENER_MOMENTUM_MIN_PCT_5M = 5;
export const SCREENER_OI_BUILD_MIN_PCT = 3;
export const SCREENER_OI_BUILD_WATCH_PCT = 1.25;
export const SCREENER_TAKER_IMBALANCE_HIGH = 1.35;
export const SCREENER_TAKER_IMBALANCE_LOW = 0.75;
