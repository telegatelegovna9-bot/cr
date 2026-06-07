import type { Ticker } from '@crypto-screener/shared';
import { PATTERN_MIN_VOLUME_24H } from './patterns.constants';

export function getEligibleBinanceFuturesTickers(tickers: Ticker[]): Ticker[] {
  return tickers
    .filter(
      ticker =>
        ticker.exchange === 'binance' &&
        ticker.marketType === 'futures' &&
        ticker.volume24h >= PATTERN_MIN_VOLUME_24H,
    )
    .sort((a, b) => b.volume24h - a.volume24h);
}

export function selectSymbolsForScan(
  tickers: Ticker[],
  batchSize: number,
  batchIndex: number,
): string[] {
  const futuresSorted = getEligibleBinanceFuturesTickers(tickers);

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
