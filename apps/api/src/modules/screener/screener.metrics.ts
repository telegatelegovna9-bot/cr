import type { ScreenerSnapshotRow } from '@crypto-screener/shared';
import type { BuildScreenerSnapshotRowInput } from './screener.types.ts';

export function buildScreenerSnapshotRow(input: BuildScreenerSnapshotRowInput): ScreenerSnapshotRow {
  return {
    symbol: input.ticker.symbol,
    exchange: input.ticker.exchange,
    marketType: input.ticker.marketType,
    price: input.ticker.lastPrice,
    spreadPct: input.spreadPct ?? null,
    fundingPct: input.fundingPct ?? null,
    oi: input.oi ?? null,
    updatedAt: input.ticker.timestamp,
    metrics: { ...input.featureMap },
  };
}
