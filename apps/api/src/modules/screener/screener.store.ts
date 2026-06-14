import { Injectable } from '@nestjs/common';
import type { Ticker } from '@crypto-screener/shared';
import {
  SCREENER_PREFERRED_EXCHANGES,
  SCREENER_RETENTION_MS,
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

type SourceStatus = 'idle' | 'live' | 'stale';

function instrumentKey(exchange: string, symbol: string, marketType: string): string {
  return `${exchange}:${marketType}:${symbol}`;
}

@Injectable()
export class ScreenerStore {
  private readonly tickerHistory = new Map<string, TickerSample[]>();
  private readonly latestTickers = new Map<string, Ticker>();
  private readonly openInterestHistory = new Map<string, OpenInterestSample[]>();
  private rows: ScreenerRow[] = [];
  private summary: ScreenerSummary = {
    totalRows: 0,
    momentumCount: 0,
    breakoutWatchCount: 0,
    oiBuildCount: 0,
    volumeExpansionCount: 0,
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
    this.latestTickers.set(key, ticker);

    const samples = this.tickerHistory.get(key) ?? [];
    const nextSample: TickerSample = {
      timestamp,
      price: ticker.lastPrice,
      quoteVolume24h: ticker.quoteVolume24h ?? 0,
    };

    if (samples.length > 0 && samples[samples.length - 1].timestamp === timestamp) {
      samples[samples.length - 1] = nextSample;
    } else {
      samples.push(nextSample);
    }

    this.tickerHistory.set(key, samples);
    this.markSource(ticker.exchange, timestamp);
  }

  recordOpenInterest(exchange: string, symbol: string, value: number, timestamp = Date.now()): void {
    const key = instrumentKey(exchange, symbol, 'futures');
    const samples = this.openInterestHistory.get(key) ?? [];
    const nextSample: OpenInterestSample = { timestamp, value };

    if (samples.length > 0 && samples[samples.length - 1].timestamp === timestamp) {
      samples[samples.length - 1] = nextSample;
    } else {
      samples.push(nextSample);
    }

    this.openInterestHistory.set(key, samples);
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
          !data.lastSeenAt
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

  getTickerSamples(exchange: string, symbol: string, marketType: string): TickerSample[] {
    return this.tickerHistory.get(instrumentKey(exchange, symbol, marketType)) ?? [];
  }

  getOpenInterestSamples(exchange: string, symbol: string): OpenInterestSample[] {
    return this.openInterestHistory.get(instrumentKey(exchange, symbol, 'futures')) ?? [];
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
  }

  private markSource(exchange: string, timestamp: number): void {
    if (!(exchange in this.sources)) return;
    this.sources[exchange] = {
      lastSeenAt: timestamp,
      status: 'live',
    };
  }
}
