// Utility functions for the crypto screener

import type { Timeframe, ExchangeId } from './types';

/**
 * Normalize a symbol to unified format (e.g., "BTC/USDT")
 */
export function normalizeSymbol(raw: string, exchange: ExchangeId): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9/._-]/g, '');

  // Common quote currencies to detect
  const quotes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'EUR', 'GBP'];

  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, -q.length);
      return `${base}/${q}`;
    }
  }

  // Handle exchange-specific formats
  if (exchange === 'okx' && s.includes('-')) {
    const parts = s.split('-');
    return `${parts[0]}/${parts[1]}`;
  }

  if (s.includes('_')) {
    const parts = s.split('_');
    return `${parts[0]}/${parts[1]}`;
  }

  return s;
}

/**
 * Convert unified symbol to exchange-specific format
 */
export function toExchangeSymbol(unified: string, exchange: ExchangeId): string {
  const [base, quoteRaw] = unified.split('/');
  const quote = quoteRaw?.split(':')[0];
  if (!base || !quote) return unified;

  switch (exchange) {
    case 'okx':
      return unified.includes(':') ? `${base}-${quote}-SWAP` : `${base}-${quote}`;
    case 'kucoin':
      return `${base}-${quote}`;
    default:
      return `${base}${quote}`;
  }
}

/**
 * Get timeframe duration in milliseconds
 */
export function timeframeToMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
    '1w': 604_800_000,
  };
  return map[tf];
}

/**
 * Format number with appropriate suffix
 */
export function formatNumber(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

/**
 * Format price with appropriate precision
 */
export function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Calculate volatility from candle data
 */
export function calculateVolatility(candles: { high: number; low: number; close: number }[]): number {
  if (candles.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const r = Math.log(candles[i].close / candles[i - 1].close);
    returns.push(r);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365 * 24); // Annualized
}

/**
 * Calculate ATR (Average True Range)
 */
export function calculateATR(
  candles: { high: number; low: number; close: number }[],
  period = 14,
): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trueRanges.push(tr);
  }

  // EMA-based ATR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < trueRanges.length; i++) {
    atr = trueRanges[i] * multiplier + atr * (1 - multiplier);
  }

  return atr;
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
