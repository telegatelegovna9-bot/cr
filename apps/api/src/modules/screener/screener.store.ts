import { Injectable } from '@nestjs/common';
import type { Ticker } from '@crypto-screener/shared';
import {
  SCREENER_FUTURES_DETECTOR_EXCHANGES,
  SCREENER_PREFERRED_EXCHANGES,
  SCREENER_RETENTION_MS,
  SCREENER_SPOT_DETECTOR_EXCHANGES,
  SCREENER_UNIVERSE_SYMBOLS,
} from './screener.config';
import type { ScreenerHealth, ScreenerRow, ScreenerSummary } from './screener.types';

interface TickerSample {
  timestamp: number;
  price: number;
  quoteVolume24h: number;
}

interface OpenInterestSample {
  timestamp: number;
  value: number;
}

interface TakerRatioSample {
  timestamp: number;
  value: number;
}

type SourceStatus = 'idle' | 'live' | 'stale';

function instrumentKey(exchange: string, symbol: string, marketType: string): string {
  return `${exchange}:${marketType}:${symbol}`;
}

function nearestTickerSampleAtOrBefore(samples: TickerSample[], targetTs: number): TickerSample | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].timestamp <= targetTs) return samples[index];
  }

  return null;
}

function upsertSortedSample<T extends { timestamp: number }>(samples: T[], nextSample: T): T[] {
  const nextSamples = [...samples];
  const existingIndex = nextSamples.findIndex(sample => sample.timestamp === nextSample.timestamp);

  if (existingIndex >= 0) {
    nextSamples[existingIndex] = nextSample;
    return nextSamples;
  }

  const insertIndex = nextSamples.findIndex(sample => sample.timestamp > nextSample.timestamp);
  if (insertIndex === -1) {
    nextSamples.push(nextSample);
    return nextSamples;
  }

  nextSamples.splice(insertIndex, 0, nextSample);
  return nextSamples;
}

@Injectable()
export class ScreenerStore {
  private readonly tickerHistory = new Map<string, TickerSample[]>();
  private readonly latestTickers = new Map<string, Ticker>();
  private readonly openInterestHistory = new Map<string, OpenInterestSample[]>();
  private readonly takerRatioHistory = new Map<string, TakerRatioSample[]>();
  private rows: ScreenerRow[] = [];
  private summary: ScreenerSummary = {
    totalRows: 0,
    momentumCount: 0,
    breakoutWatchCount: 0,
    compressionBreakoutCount: 0,
    oiBuildCount: 0,
    volumeExpansionCount: 0,
    shortSqueezeRiskCount: 0,
    longLiquidationRiskCount: 0,
    averageScore: 0,
    universeSize: SCREENER_UNIVERSE_SYMBOLS.length,
  };
  private readonly sources: ScreenerHealth['sources'] = Object.fromEntries(
    SCREENER_PREFERRED_EXCHANGES.map(exchange => [exchange, { lastSeenAt: null, status: 'idle' as SourceStatus }]),
  );
  private lastComputedAt: number | null = null;
  private lastPrunedAt = 0;

  recordTicker(ticker: Ticker, timestamp = Date.now()): void {
    const key = instrumentKey(ticker.exchange, ticker.symbol, ticker.marketType ?? 'spot');
    const storedTicker: Ticker = {
      ...ticker,
      timestamp,
    };
    const currentLatest = this.latestTickers.get(key);
    if (!currentLatest || currentLatest.timestamp <= timestamp) {
      this.latestTickers.set(key, storedTicker);
    }

    const samples = this.tickerHistory.get(key) ?? [];
    const nextSample: TickerSample = {
      timestamp,
      price: ticker.lastPrice,
      quoteVolume24h: ticker.quoteVolume24h ?? 0,
    };

    this.tickerHistory.set(key, upsertSortedSample(samples, nextSample));
    this.markSource(ticker.exchange, timestamp);
  }

  recordOpenInterest(exchange: string, symbol: string, value: number, timestamp = Date.now()): void {
    const key = instrumentKey(exchange, symbol, 'futures');
    const samples = this.openInterestHistory.get(key) ?? [];
    const nextSample: OpenInterestSample = { timestamp, value };

    this.openInterestHistory.set(key, upsertSortedSample(samples, nextSample));
    this.markSource(exchange, timestamp);
  }

  recordTakerBuyRatio(exchange: string, symbol: string, value: number, timestamp = Date.now()): void {
    const key = instrumentKey(exchange, symbol, 'futures');
    const samples = this.takerRatioHistory.get(key) ?? [];
    const nextSample: TakerRatioSample = { timestamp, value };

    this.takerRatioHistory.set(key, upsertSortedSample(samples, nextSample));
    this.markSource(exchange, timestamp);
  }

  setSnapshot(rows: ScreenerRow[], summary: ScreenerSummary, timestamp = Date.now()): void {
    this.rows = rows;
    this.summary = summary;
    this.lastComputedAt = timestamp;
  }

  getRows(): ScreenerRow[] {
    return this.rows;
  }

  getSummary(): ScreenerSummary {
    return this.summary;
  }

  getHealth(now = Date.now()): ScreenerHealth {
    const sources = Object.fromEntries(
      Object.entries(this.sources).map(([exchange, data]) => {
        const status: SourceStatus =
          data.lastSeenAt === null
            ? 'idle'
            : now - data.lastSeenAt <= 2 * 60_000
              ? 'live'
              : 'stale';
        return [exchange, { lastSeenAt: data.lastSeenAt, status }];
      }),
    );

    return {
      lastComputedAt: this.lastComputedAt,
      universeSize: SCREENER_UNIVERSE_SYMBOLS.length,
      sources,
    };
  }

  getLatestTicker(symbol: string): Ticker | null {
    for (const exchange of SCREENER_PREFERRED_EXCHANGES) {
      const futures = this.latestTickers.get(instrumentKey(exchange, symbol, 'futures'));
      if (futures) return futures;
    }

    for (const exchange of SCREENER_PREFERRED_EXCHANGES) {
      const spot = this.latestTickers.get(instrumentKey(exchange, symbol, 'spot'));
      if (spot) return spot;
    }

    return null;
  }

  getLatestTickersForSymbol(symbol: string, marketType: 'spot' | 'futures'): Ticker[] {
    const exchanges =
      marketType === 'futures'
        ? SCREENER_FUTURES_DETECTOR_EXCHANGES
        : SCREENER_SPOT_DETECTOR_EXCHANGES;

    return exchanges
      .map(exchange => this.latestTickers.get(instrumentKey(exchange, symbol, marketType)) ?? null)
      .filter((ticker): ticker is Ticker => ticker !== null);
  }

  getRelativePriceDeviation(symbol: string, marketType: 'spot' | 'futures'): {
    medianPrice: number;
    byExchange: Array<{ exchange: string; price: number; deviationBps: number }>;
  } {
    const tickers = this.getLatestTickersForSymbol(symbol, marketType);
    const prices = tickers.map(ticker => ticker.lastPrice).sort((a, b) => a - b);
    let medianPrice = 0;
    if (prices.length > 0) {
      const midpoint = Math.floor(prices.length / 2);
      medianPrice =
        prices.length % 2 === 0
          ? (prices[midpoint - 1] + prices[midpoint]) / 2
          : prices[midpoint];
    }

    return {
      medianPrice,
      byExchange: tickers.map(ticker => ({
        exchange: ticker.exchange,
        price: ticker.lastPrice,
        deviationBps: medianPrice > 0 ? ((ticker.lastPrice - medianPrice) / medianPrice) * 10_000 : 0,
      })),
    };
  }

  getTickerSamples(exchange: string, symbol: string, marketType: string): TickerSample[] {
    return this.tickerHistory.get(instrumentKey(exchange, symbol, marketType)) ?? [];
  }

  getRangeCompression(exchange: string, symbol: string, marketType: string, windowMs: number): number {
    const samples = this.getTickerSamples(exchange, symbol, marketType);
    const latest = samples[samples.length - 1];
    if (!latest) return 0;

    const relevant = samples.filter(sample => sample.timestamp >= latest.timestamp - windowMs);
    if (relevant.length === 0 || latest.price === 0) return 0;

    const prices = relevant.map(sample => sample.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    return ((high - low) / latest.price) * 100;
  }

  getRollingQuoteVolumeDelta(exchange: string, symbol: string, marketType: string, windowMs: number): number {
    const samples = this.getTickerSamples(exchange, symbol, marketType);
    const latest = samples[samples.length - 1];
    if (!latest) return 0;

    const previous = nearestTickerSampleAtOrBefore(samples, latest.timestamp - windowMs);
    if (!previous) return 0;

    return Math.max(0, latest.quoteVolume24h - previous.quoteVolume24h);
  }

  getOpenInterestSamples(exchange: string, symbol: string): OpenInterestSample[] {
    return this.openInterestHistory.get(instrumentKey(exchange, symbol, 'futures')) ?? [];
  }

  getTakerRatioSamples(exchange: string, symbol: string): TakerRatioSample[] {
    return this.takerRatioHistory.get(instrumentKey(exchange, symbol, 'futures')) ?? [];
  }

  prune(now = Date.now()): void {
    if (now - this.lastPrunedAt < 60_000) return;
    this.lastPrunedAt = now;
    const cutoff = now - SCREENER_RETENTION_MS;

    for (const [key, samples] of this.tickerHistory.entries()) {
      const retained = samples.filter(sample => sample.timestamp >= cutoff);
      if (retained.length === 0) this.tickerHistory.delete(key);
      else this.tickerHistory.set(key, retained);
    }

    for (const [key, samples] of this.openInterestHistory.entries()) {
      const retained = samples.filter(sample => sample.timestamp >= cutoff);
      if (retained.length === 0) this.openInterestHistory.delete(key);
      else this.openInterestHistory.set(key, retained);
    }

    for (const [key, samples] of this.takerRatioHistory.entries()) {
      const retained = samples.filter(sample => sample.timestamp >= cutoff);
      if (retained.length === 0) this.takerRatioHistory.delete(key);
      else this.takerRatioHistory.set(key, retained);
    }
  }

  private markSource(exchange: string, timestamp: number): void {
    if (!(exchange in this.sources)) return;
    const current = this.sources[exchange];
    if (current.lastSeenAt !== null && current.lastSeenAt > timestamp) {
      return;
    }

    this.sources[exchange] = {
      lastSeenAt: timestamp,
      status: 'live',
    };
  }
}
