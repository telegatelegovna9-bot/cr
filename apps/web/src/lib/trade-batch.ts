import type { Trade } from '@crypto-screener/shared';

export function tradeBatchKey(trade: { exchange: string; marketType?: 'spot' | 'futures'; symbol: string }): string {
  return `${trade.exchange}:${trade.marketType ?? 'spot'}:${trade.symbol}`;
}

export function appendTradesBatch(
  current: Map<string, Trade[]>,
  trades: Trade[],
  maxTradesPerMarket: number,
): Map<string, Trade[]> {
  if (trades.length === 0) return current;

  const next = new Map(current);
  for (const trade of trades) {
    const key = tradeBatchKey(trade);
    const existing = next.get(key) ?? [];
    const updated = existing.length >= maxTradesPerMarket
      ? [...existing, trade].slice(-maxTradesPerMarket)
      : [...existing, trade];
    next.set(key, updated);
  }

  return next;
}
