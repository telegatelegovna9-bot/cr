import type { Ticker } from '@crypto-screener/shared';

export function selectSymbolsForScan(
  tickers: Ticker[],
  batchSize: number,
  batchIndex: number,
): string[] {
  const futuresSorted = tickers
    .filter(ticker => ticker.exchange === 'binance' && ticker.marketType === 'futures')
    .sort((a, b) => b.volume24h - a.volume24h);

  const uniqueSymbols = Array.from(new Set(futuresSorted.map(ticker => ticker.symbol)));
  if (uniqueSymbols.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.min(batchSize, uniqueSymbols.length));
  const totalBatches = Math.ceil(uniqueSymbols.length / size);
  const normalizedBatch = ((batchIndex % totalBatches) + totalBatches) % totalBatches;
  const start = normalizedBatch * size;
  const slice = uniqueSymbols.slice(start, start + size);

  if (slice.length === size || uniqueSymbols.length <= size) {
    return slice;
  }

  return slice.concat(uniqueSymbols.slice(0, size - slice.length));
}
