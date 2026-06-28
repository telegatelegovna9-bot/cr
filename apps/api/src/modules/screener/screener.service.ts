import { Injectable, OnModuleInit } from '@nestjs/common';
import { SCREENER_REFRESH_INTERVAL_MS, type ExchangeId, type ScreenerMarketType, type ScreenerSnapshotMetricId, type ScreenerSnapshotRow } from '@crypto-screener/shared';
import type { TickerWithMeta } from '../market/market.service';
import { MarketService } from '../market/market.service';
import type { ScreenerSnapshotBucket } from './screener.types';
import { buildScreenerSnapshotRow } from './screener.metrics';
import { Interval } from '@nestjs/schedule';

interface TickerSample {
  timestamp: number;
  lastPrice: number;
  volume24h: number;
  quoteVolume24h: number | null;
  trades24h: number | null;
  high24h: number;
  low24h: number;
}

@Injectable()
export class ScreenerService implements OnModuleInit {
  private readonly snapshots = new Map<ScreenerMarketType, ScreenerSnapshotRow[]>();
  private readonly updatedAt = new Map<ScreenerMarketType, number>();
  private readonly sampleHistory = new Map<string, TickerSample[]>();
  private readonly HISTORY_WINDOW_MS = 10 * 60 * 1000;
  private readonly BASELINE_WINDOW_MS = 60 * 1000;
  private readonly MIN_SPIKE_SAMPLES = 3;
  private readonly FULL_REFRESH_INTERVAL_MS = 15_000;
  private readonly STALE_ROW_THRESHOLD_MS = 2 * 60 * 1000;
  private lastFullRefreshAt = 0;

  constructor(private readonly marketService: MarketService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshSnapshotsFromMarketCache();
  }

  @Interval(SCREENER_REFRESH_INTERVAL_MS)
  async refreshSnapshotsFromMarketCache(): Promise<void> {
    await this.ensureFreshGlobalTickers();

    const tickers = this.marketService.getAllTickerValues();
    if (tickers.length === 0) {
      return;
    }

    for (const ticker of tickers) {
      this.recordSample(ticker);
    }

    const now = Date.now();
    const rows = tickers
      .filter(ticker => now - ticker.timestamp <= this.STALE_ROW_THRESHOLD_MS)
      .map(ticker => this.mapTickerToSnapshotRow(ticker));
    this.refreshFromMarketRows(rows);
  }

  refreshFromMarketRows(rows: ScreenerSnapshotRow[]): void {
    const grouped = {
      spot: rows.filter(row => row.marketType === 'spot'),
      futures: rows.filter(row => row.marketType === 'futures'),
    } as const;

    this.updateSnapshot('spot', grouped.spot);
    this.updateSnapshot('futures', grouped.futures);
  }

  updateSnapshot(marketType: ScreenerMarketType, rows: ScreenerSnapshotRow[]): void {
    const bucketRows = rows
      .filter(row => row.marketType === marketType)
      .map(row => this.cloneRow(row));

    this.snapshots.set(marketType, bucketRows);
    this.updatedAt.set(marketType, this.getBucketUpdatedAt(bucketRows));
  }

  listSnapshot(marketType: ScreenerMarketType): ScreenerSnapshotBucket {
    const existingRows = this.snapshots.get(marketType);
    if (!existingRows || existingRows.length === 0) {
      const tickers = this.marketService.getAllTickerValues();
      const now = Date.now();
      const rows = tickers
        .filter(ticker => now - ticker.timestamp <= this.STALE_ROW_THRESHOLD_MS)
        .map(ticker => this.mapTickerToSnapshotRow(ticker));
      this.refreshFromMarketRows(rows);
    }

    return {
      marketType,
      updatedAt: this.updatedAt.get(marketType) ?? 0,
      rows: (this.snapshots.get(marketType) ?? []).map(row => this.cloneRow(row)),
    };
  }

  readonly buildRow = buildScreenerSnapshotRow;

  private mapTickerToSnapshotRow(ticker: TickerWithMeta): ScreenerSnapshotRow {
    const featureMap = this.buildFeatureMap(ticker);

    return this.buildRow({
      ticker: {
        exchange: ticker.exchange as ExchangeId,
        marketType: ticker.marketType,
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        timestamp: ticker.timestamp,
        priceChangePercent24h: ticker.priceChangePercent24h,
        volume24h: ticker.volume24h,
      },
      featureMap,
      spreadPct: this.resolveSpreadPct(ticker),
    });
  }

  private buildFeatureMap(ticker: TickerWithMeta): Partial<Record<ScreenerSnapshotMetricId, number | null>> {
    const history = this.sampleHistory.get(this.sampleKey(ticker)) ?? [];
    const latest = history[history.length - 1];
    const baseline = this.findBaselineSample(history, latest?.timestamp ?? ticker.timestamp);

    const deltaVolume = baseline ? this.positiveDelta(ticker.volume24h, baseline.volume24h) : null;
    const deltaTrades = baseline ? this.positiveDelta(ticker.trades24h ?? null, baseline.trades24h) : null;
    const turnover =
      baseline
        ? this.resolveTurnoverDelta(ticker, baseline)
        : null;

    const previousVolumeDeltas = this.collectPreviousDeltas(history, 'volume24h');
    const previousTradeDeltas = this.collectPreviousDeltas(history, 'trades24h');
    const natrPct = this.resolveNatrPct(ticker, latest, baseline);
    const deltaVolumePct = this.deltaPercent(deltaVolume, previousVolumeDeltas);

    return {
      '1m.changePct': baseline && baseline.lastPrice > 0
        ? ((ticker.lastPrice - baseline.lastPrice) / baseline.lastPrice) * 100
        : null,
      '1m.trades': deltaTrades,
      '1m.turnover': turnover,
      '1m.natrPct': natrPct,
      '1m.volumeSpikePct': this.spikePercent(deltaVolume, previousVolumeDeltas),
      '1m.tradesSpikePct': this.spikePercent(deltaTrades, previousTradeDeltas),
      '1m.oiChangePct': null,
      '1m.deltaVolumePct': deltaVolumePct,
      '1m.deltaVolume': deltaVolume,
    };
  }

  private resolveSpreadPct(ticker: TickerWithMeta): number | null {
    if (typeof ticker.spread === 'number') {
      return ticker.spread;
    }

    if (typeof ticker.bid === 'number' && typeof ticker.ask === 'number' && ticker.lastPrice > 0) {
      return ((ticker.ask - ticker.bid) / ticker.lastPrice) * 100;
    }

    return null;
  }

  private resolveTurnoverDelta(ticker: TickerWithMeta, baseline: TickerSample): number | null {
    if (typeof ticker.quoteVolume24h === 'number' && typeof baseline.quoteVolume24h === 'number') {
      return this.positiveDelta(ticker.quoteVolume24h, baseline.quoteVolume24h);
    }

    const deltaVolume = this.positiveDelta(ticker.volume24h, baseline.volume24h);
    return deltaVolume === null ? null : deltaVolume * ticker.lastPrice;
  }

  private recordSample(ticker: TickerWithMeta): void {
    const key = this.sampleKey(ticker);
    const history = this.sampleHistory.get(key) ?? [];
    const sample: TickerSample = {
      timestamp: ticker.timestamp,
      lastPrice: ticker.lastPrice,
      volume24h: ticker.volume24h,
      quoteVolume24h: typeof ticker.quoteVolume24h === 'number' ? ticker.quoteVolume24h : null,
      trades24h: typeof ticker.trades24h === 'number' ? ticker.trades24h : null,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
    };

    const previous = history[history.length - 1];
    if (previous && previous.timestamp === sample.timestamp) {
      history[history.length - 1] = sample;
    } else {
      history.push(sample);
    }

    const pruned = history.filter(item => sample.timestamp - item.timestamp <= this.HISTORY_WINDOW_MS);
    this.sampleHistory.set(key, pruned);
  }

  private findBaselineSample(history: TickerSample[], currentTimestamp: number): TickerSample | null {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const sample = history[index];
      if (currentTimestamp - sample.timestamp >= this.BASELINE_WINDOW_MS) {
        return sample;
      }
    }

    return history.length > 1 ? history[0] : null;
  }

  private collectPreviousDeltas(history: TickerSample[], field: 'volume24h' | 'trades24h'): number[] {
    if (history.length < 3) {
      return [];
    }

    const deltas: number[] = [];

    for (let index = 1; index < history.length - 1; index += 1) {
      const current = history[index];
      const previous = history[index - 1];
      const delta = this.positiveDelta(current[field] ?? null, previous[field] ?? null);
      if (typeof delta === 'number') {
        deltas.push(delta);
      }
    }

    return deltas.slice(-12);
  }

  private spikePercent(current: number | null, previous: number[]): number | null {
    if (current === null || previous.length < this.MIN_SPIKE_SAMPLES) {
      return null;
    }

    const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (average <= 0) {
      return null;
    }

    return ((current - average) / average) * 100;
  }

  private deltaPercent(current: number | null, previous: number[]): number | null {
    if (current === null || previous.length < this.MIN_SPIKE_SAMPLES) {
      return null;
    }

    const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (average <= 0) {
      return null;
    }

    return (current / average) * 100;
  }

  private positiveDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
    if (typeof current !== 'number' || typeof previous !== 'number') {
      return null;
    }

    return Math.max(0, current - previous);
  }

  private sampleKey(ticker: TickerWithMeta): string {
    return `${ticker.exchange}:${ticker.marketType}:${ticker.symbol}`;
  }

  private resolveNatrPct(ticker: TickerWithMeta, latest: TickerSample | undefined, baseline: TickerSample | null): number | null {
    if (baseline && latest) {
      const rangeHigh = Math.max(latest.high24h, baseline.high24h, ticker.high24h);
      const rangeLow = Math.min(latest.low24h, baseline.low24h, ticker.low24h);
      if (ticker.lastPrice > 0) {
        return ((rangeHigh - rangeLow) / ticker.lastPrice) * 100;
      }
    }

    if (ticker.lastPrice <= 0) {
      return null;
    }

    return ((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100;
  }

  private cloneRow(row: ScreenerSnapshotRow): ScreenerSnapshotRow {
    return {
      ...row,
      metrics: { ...row.metrics },
    };
  }

  private getBucketUpdatedAt(rows: ScreenerSnapshotRow[]): number {
    return rows.reduce((latest, row) => Math.max(latest, row.updatedAt), 0);
  }

  private async ensureFreshGlobalTickers(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFullRefreshAt < this.FULL_REFRESH_INTERVAL_MS) {
      return;
    }

    await this.marketService.refreshAllTickersSnapshot();
    this.lastFullRefreshAt = Date.now();
  }
}
