import { Injectable } from '@nestjs/common';
import type { ScreenerEvent } from '@crypto-screener/shared';
import {
  SCREENER_BEST_SETUPS_LIMIT,
  SCREENER_BREAKOUT_MIN_PCT,
  SCREENER_BREAKOUT_RETENTION_MS,
  SCREENER_FUTURES_UNIVERSE_SYMBOLS,
  SCREENER_MOMENTUM_MIN_PCT_1M,
  SCREENER_MOMENTUM_MIN_PCT_5M,
  SCREENER_OI_BUILD_MIN_PCT,
  SCREENER_PREFERRED_EXCHANGES,
  SCREENER_SPOT_UNIVERSE_SYMBOLS,
  SCREENER_TAKER_IMBALANCE_HIGH,
  SCREENER_TAKER_IMBALANCE_LOW,
  SCREENER_UNIVERSE_SYMBOLS,
  SCREENER_VOLUME_SPIKE_MIN_RATIO,
} from './screener.config';
import { FuturesOiBuildDetector } from './detectors/futures-oi-build.detector';
import { FuturesSqueezeRiskDetector } from './detectors/futures-squeeze-risk.detector';
import { SpotBreakoutPressureDetector } from './detectors/spot-breakout-pressure.detector';
import { SpotCrossExchangeDetector } from './detectors/spot-cross-exchange.detector';
import { ScreenerStore } from './screener.store';
import type { ScreenerConviction, ScreenerRow, ScreenerState, ScreenerSummary } from './screener.types';

interface SamplePoint {
  timestamp: number;
  price?: number;
  quoteVolume24h?: number;
  value?: number;
}

interface BreakoutRetentionSignal {
  compressionPct: number;
  direction: 'up' | 'down' | null;
  durationMs: number;
  referencePrice: number | null;
}

interface ExchangeSnapshot {
  exchange: string;
  timestamp: number;
  price: number;
}

interface RelativeDeviationSnapshot extends ExchangeSnapshot {
  deviationBps: number;
}

interface RelativeDeviationOutlier extends RelativeDeviationSnapshot {
  medianPrice: number;
}

interface RelativeDeviationSummary {
  medianPrice: number;
  byExchange: RelativeDeviationSnapshot[];
}

interface ScreenerFeatureContext {
  id: string;
  symbol: string;
  baseAsset: string;
  marketType: 'spot' | 'futures';
  primaryExchange: string;
  lastPrice: number;
  priceChange1m: number;
  priceChange5m: number;
  priceChange15m: number;
  range15mPct: number;
  volumeNow: number;
  volumeAvg: number;
  volumeSpikeRatio: number;
  openInterestNow: number | null;
  openInterestChangePct: number | null;
  takerBuyRatio: number | null;
  liquidationUsd: number | null;
  compressionPct: number;
  breakoutDirection: 'up' | 'down' | null;
  breakoutRetentionMs: number;
  breakoutReferencePrice: number | null;
  compressionBreakout: boolean;
  medianPrice: number;
  exchangeCount: number;
  outlierDeviation: RelativeDeviationOutlier | null;
  updatedAt: number;
}

interface ScreenerBuildResult {
  bestSetups: ScreenerEvent[];
  spotEvents: ScreenerEvent[];
  futuresEvents: ScreenerEvent[];
  rows: ScreenerRow[];
  summary: ScreenerSummary;
}

const CROSS_EXCHANGE_MAX_SNAPSHOT_SKEW_MS = 45_000;
const WINDOW_LOOKBACK_MAX_GAP_MS = 45_000;

function percentChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

function nearestSampleAtOrBefore<T extends SamplePoint>(samples: T[], targetTs: number): T | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].timestamp <= targetTs) return samples[index];
  }

  return null;
}

function sampleAtOrBeforeWithin<T extends SamplePoint>(samples: T[], targetTs: number, maxGapMs: number): T | null {
  const sample = nearestSampleAtOrBefore(samples, targetTs);
  if (!sample) return null;
  return targetTs - sample.timestamp <= maxGapMs ? sample : null;
}

function quoteVolumeDelta(samples: SamplePoint[], endTs: number, windowMs: number): number {
  const latest = sampleAtOrBeforeWithin(samples, endTs, WINDOW_LOOKBACK_MAX_GAP_MS);
  const previous = sampleAtOrBeforeWithin(samples, endTs - windowMs, WINDOW_LOOKBACK_MAX_GAP_MS);
  if (!latest || !previous) return 0;

  const latestVolume = latest.quoteVolume24h ?? 0;
  const previousVolume = previous.quoteVolume24h ?? 0;
  return Math.max(0, latestVolume - previousVolume);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rangePct(samples: SamplePoint[], now: number, windowMs: number, latestPrice: number): number {
  const relevant = samples.filter(sample => sample.timestamp >= now - windowMs && sample.timestamp <= now);
  if (relevant.length === 0 || !latestPrice) return 0;

  const prices = relevant.map(sample => sample.price ?? latestPrice);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  return ((high - low) / latestPrice) * 100;
}

function statePriority(state: ScreenerState | null): number {
  switch (state) {
    case 'Short Squeeze Risk':
    case 'Long Liquidation Risk':
      return 5;
    case 'Breakout Watch':
      return 4;
    case 'OI Build':
    case 'OI Unwind':
      return 3;
    case 'Volume Expansion':
      return 2;
    case 'Momentum':
      return 1;
    default:
      return 0;
  }
}

function convictionPriority(conviction: ScreenerConviction): number {
  switch (conviction) {
    case 'extreme':
      return 3;
    case 'strong':
      return 2;
    case 'watch':
      return 1;
  }
}

function promotionPriority(event: ScreenerEvent): number {
  switch (event.promotionTier) {
    case 'rare':
      return 3;
    case 'actionable':
      return 2;
    case 'watch':
      return 1;
    case 'ignore':
      return 0;
  }
}

function strengthPriority(event: ScreenerEvent): number {
  switch (event.strengthTier) {
    case 'event-live':
      return 3;
    case 'high-risk':
      return 2;
    case 'actionable':
      return 1;
    case 'watching':
      return 0;
  }
}

function comparePromotedEvents(a: ScreenerEvent, b: ScreenerEvent): number {
  return (
    promotionPriority(b) - promotionPriority(a)
    || strengthPriority(b) - strengthPriority(a)
    || b.updatedAt - a.updatedAt
    || a.symbol.localeCompare(b.symbol)
    || a.detectorType.localeCompare(b.detectorType)
  );
}

function isCurrentSnapshotFresh(timestamp: number, now: number): boolean {
  return now - timestamp <= WINDOW_LOOKBACK_MAX_GAP_MS;
}

@Injectable()
export class ScreenerEngine {
  private readonly spotBreakoutPressure = new SpotBreakoutPressureDetector();
  private readonly spotCrossExchange = new SpotCrossExchangeDetector();
  private readonly futuresOiBuild = new FuturesOiBuildDetector();
  private readonly futuresSqueezeRisk = new FuturesSqueezeRiskDetector();

  constructor(private readonly store: ScreenerStore) {}

  build(now = Date.now()): ScreenerBuildResult {
    const spotContexts = this.collectFeatureContexts(SCREENER_SPOT_UNIVERSE_SYMBOLS, 'spot', now);
    const futuresContexts = this.collectFeatureContexts(SCREENER_FUTURES_UNIVERSE_SYMBOLS, 'futures', now);
    const rows = [...spotContexts, ...futuresContexts]
      .map(context => this.buildLegacyRow(context))
      .filter((row): row is ScreenerRow => row !== null);

    rows.sort(
      (a, b) =>
        statePriority(b.state) - statePriority(a.state)
        || convictionPriority(b.conviction) - convictionPriority(a.conviction)
        || b.score - a.score
        || b.updatedAt - a.updatedAt,
    );

    const candidates = [
      ...spotContexts.flatMap(context => this.detectSpotEvents(context)),
      ...futuresContexts.flatMap(context => this.detectFuturesEvents(context)),
    ];
    const promotedCandidates = candidates.filter(
      event => event.promotionTier === 'rare' || event.promotionTier === 'actionable',
    );
    const bestSetupSource = promotedCandidates.length > 0
      ? promotedCandidates
      : candidates.filter(event => event.promotionTier === 'watch');
    const bestSetups = this.mergeBestSetupDuplicates(bestSetupSource)
      .sort(comparePromotedEvents)
      .slice(0, SCREENER_BEST_SETUPS_LIMIT);

    const summary = this.buildSummary(rows);

    return {
      bestSetups,
      spotEvents: candidates.filter(event => event.marketMode === 'spot').sort(comparePromotedEvents),
      futuresEvents: candidates.filter(event => event.marketMode === 'futures').sort(comparePromotedEvents),
      rows,
      summary,
    };
  }

  private collectFeatureContexts(
    symbols: readonly string[],
    marketType: 'spot' | 'futures',
    now: number,
  ): ScreenerFeatureContext[] {
    return symbols
      .map(symbol => {
        const exchangeSnapshots = this.getExchangeSnapshots(symbol, marketType, now);
        const primarySnapshot = this.getPreferredExchangeSnapshot(exchangeSnapshots);
        if (!primarySnapshot) return null;
        if (!isCurrentSnapshotFresh(primarySnapshot.timestamp, now)) return null;
        return this.buildFeatureContext(symbol, marketType, primarySnapshot, exchangeSnapshots, now);
      })
      .filter((context): context is ScreenerFeatureContext => context !== null);
  }

  private getExchangeSnapshots(
    symbol: string,
    marketType: 'spot' | 'futures',
    now: number,
  ): ExchangeSnapshot[] {
    const tickers = this.store.getLatestTickersForSymbol(symbol, marketType);

    return tickers.flatMap(ticker => {
      const currentSample = nearestSampleAtOrBefore(
        this.store.getTickerSamples(ticker.exchange, symbol, marketType),
        now,
      );
      if (!currentSample || currentSample.price === undefined) return [];

      return [{
        exchange: ticker.exchange,
        timestamp: currentSample.timestamp,
        price: currentSample.price,
      }];
    });
  }

  private getPreferredExchangeSnapshot(exchangeSnapshots: ExchangeSnapshot[]): ExchangeSnapshot | null {
    for (const exchange of SCREENER_PREFERRED_EXCHANGES) {
      const snapshot = exchangeSnapshots.find(candidate => candidate.exchange === exchange);
      if (snapshot) return snapshot;
    }

    return exchangeSnapshots[0] ?? null;
  }

  private buildFeatureContext(
    symbol: string,
    marketType: 'spot' | 'futures',
    primarySnapshot: ExchangeSnapshot,
    exchangeSnapshots: ExchangeSnapshot[],
    now: number,
  ): ScreenerFeatureContext | null {
    const samples = this.store.getTickerSamples(primarySnapshot.exchange, symbol, marketType);
    if (samples.length === 0) return null;

    const currentSample = nearestSampleAtOrBefore(samples, primarySnapshot.timestamp);
    if (!currentSample || currentSample.price === undefined) return null;

    const effectiveNow = currentSample.timestamp;
    const sample1m = sampleAtOrBeforeWithin(samples, effectiveNow - 60_000, WINDOW_LOOKBACK_MAX_GAP_MS);
    const sample5m = sampleAtOrBeforeWithin(samples, effectiveNow - 5 * 60_000, WINDOW_LOOKBACK_MAX_GAP_MS);
    const sample15m = sampleAtOrBeforeWithin(samples, effectiveNow - 15 * 60_000, WINDOW_LOOKBACK_MAX_GAP_MS);

    const priceChange1m = sample1m ? percentChange(sample1m.price ?? currentSample.price, currentSample.price) : 0;
    const priceChange5m = sample5m ? percentChange(sample5m.price ?? currentSample.price, currentSample.price) : 0;
    const priceChange15m = sample15m ? percentChange(sample15m.price ?? currentSample.price, currentSample.price) : 0;
    const range15mPct = rangePct(samples, effectiveNow, 15 * 60_000, currentSample.price);

    const volumeNow = quoteVolumeDelta(samples, effectiveNow, 60_000);
    const previousMinuteDeltas = [2, 3, 4, 5]
      .map(multiplier => quoteVolumeDelta(samples, effectiveNow - (multiplier - 1) * 60_000, 60_000))
      .filter(value => value > 0);
    const volumeAvg =
      previousMinuteDeltas.length > 0
        ? previousMinuteDeltas.reduce((sum, value) => sum + value, 0) / previousMinuteDeltas.length
        : volumeNow;
    const volumeSpikeRatio = volumeAvg > 0 ? volumeNow / volumeAvg : 1;

    const openInterestSamples =
      marketType === 'futures'
        ? this.store.getOpenInterestSamples(primarySnapshot.exchange, symbol)
        : [];
    const openInterestCurrent = sampleAtOrBeforeWithin(
      openInterestSamples,
      effectiveNow,
      WINDOW_LOOKBACK_MAX_GAP_MS,
    );
    const openInterestNow = openInterestCurrent?.value ?? null;
    const openInterestBase = sampleAtOrBeforeWithin(
      openInterestSamples,
      effectiveNow - 5 * 60_000,
      WINDOW_LOOKBACK_MAX_GAP_MS,
    );
    const openInterestChangePct =
      openInterestNow !== null && openInterestBase?.value
        ? percentChange(openInterestBase.value, openInterestNow)
        : null;

    const takerSamples =
      marketType === 'futures'
        ? this.store.getTakerRatioSamples(primarySnapshot.exchange, symbol)
        : [];
    const takerBuyRatio = sampleAtOrBeforeWithin(
      takerSamples,
      effectiveNow,
      WINDOW_LOOKBACK_MAX_GAP_MS,
    )?.value ?? null;

    const liquidationUsd = this.estimateLiquidationPressureUsd({
      volumeNow,
      priceChange5m,
      openInterestChangePct,
      takerBuyRatio,
    });

    const breakoutSignal =
      marketType === 'spot'
        ? this.getBreakoutRetentionSignal(samples, currentSample)
        : { compressionPct: 0, direction: null, durationMs: 0, referencePrice: null };
    const compressionBreakout =
      marketType === 'spot'
      && breakoutSignal.direction !== null
      && breakoutSignal.durationMs >= SCREENER_BREAKOUT_RETENTION_MS
      && breakoutSignal.compressionPct <= SCREENER_BREAKOUT_MIN_PCT
      && Math.abs(priceChange5m) >= SCREENER_BREAKOUT_MIN_PCT
      && volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO;

    const freshExchangeSnapshots = exchangeSnapshots.filter(snapshot => (
      isCurrentSnapshotFresh(snapshot.timestamp, now)
      && Math.abs(snapshot.timestamp - primarySnapshot.timestamp) <= CROSS_EXCHANGE_MAX_SNAPSHOT_SKEW_MS
    ));
    const deviation = this.getRelativePriceDeviation(freshExchangeSnapshots);
    const outlierDeviation = deviation.byExchange.reduce<RelativeDeviationOutlier | null>((current, candidate) => {
      if (!current || Math.abs(candidate.deviationBps) > Math.abs(current.deviationBps)) {
        return {
          ...candidate,
          medianPrice: deviation.medianPrice,
        };
      }

      return current;
    }, null);

    return {
      id: `${primarySnapshot.exchange}:${marketType}:${symbol}`,
      symbol,
      baseAsset: symbol.split('/')[0] ?? symbol,
      marketType,
      primaryExchange: primarySnapshot.exchange,
      lastPrice: currentSample.price,
      priceChange1m,
      priceChange5m,
      priceChange15m,
      range15mPct,
      volumeNow,
      volumeAvg,
      volumeSpikeRatio,
      openInterestNow,
      openInterestChangePct,
      takerBuyRatio,
      liquidationUsd,
      compressionPct: breakoutSignal.compressionPct,
      breakoutDirection: breakoutSignal.direction,
      breakoutRetentionMs: breakoutSignal.durationMs,
      breakoutReferencePrice: breakoutSignal.referencePrice,
      compressionBreakout,
      medianPrice: deviation.medianPrice,
      exchangeCount: deviation.byExchange.length,
      outlierDeviation,
      updatedAt: currentSample.timestamp,
    };
  }

  private getRelativePriceDeviation(exchangeSnapshots: ExchangeSnapshot[]): RelativeDeviationSummary {
    const prices = exchangeSnapshots.map(snapshot => snapshot.price).sort((a, b) => a - b);
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
      byExchange: exchangeSnapshots.map(snapshot => ({
        ...snapshot,
        deviationBps: medianPrice > 0 ? ((snapshot.price - medianPrice) / medianPrice) * 10_000 : 0,
      })),
    };
  }

  private detectSpotEvents(context: ScreenerFeatureContext): ScreenerEvent[] {
    if (context.marketType !== 'spot') return [];

    return [
      ...this.spotBreakoutPressure.detect({
        symbol: context.symbol,
        primaryExchange: context.primaryExchange,
        lastPrice: context.lastPrice,
        updatedAt: context.updatedAt,
        priceChange5m: context.priceChange5m,
        volumeSpikeRatio: context.volumeSpikeRatio,
        volumeNow: context.volumeNow,
        compressionPct: context.compressionPct,
        breakoutRetentionMs: context.breakoutRetentionMs,
        breakoutDirection: context.breakoutDirection,
        breakoutReferencePrice: context.breakoutReferencePrice,
      }),
      ...this.spotCrossExchange.detect({
        symbol: context.symbol,
        updatedAt: context.outlierDeviation?.timestamp ?? context.updatedAt,
        outlierExchange: context.outlierDeviation?.exchange ?? null,
        outlierPrice: context.outlierDeviation?.price ?? null,
        medianPrice: context.outlierDeviation?.medianPrice ?? context.medianPrice,
        deviationBps: context.outlierDeviation?.deviationBps ?? 0,
        exchangeCount: context.exchangeCount,
      }),
    ];
  }

  private detectFuturesEvents(context: ScreenerFeatureContext): ScreenerEvent[] {
    if (context.marketType !== 'futures') return [];

    return [
      ...this.futuresOiBuild.detect({
        symbol: context.symbol,
        primaryExchange: context.primaryExchange,
        updatedAt: context.updatedAt,
        priceChange5m: context.priceChange5m,
        openInterestNow: context.openInterestNow,
        openInterestChangePct: context.openInterestChangePct,
        volumeSpikeRatio: context.volumeSpikeRatio,
        takerBuyRatio: context.takerBuyRatio,
      }),
      ...this.futuresSqueezeRisk.detect({
        symbol: context.symbol,
        primaryExchange: context.primaryExchange,
        updatedAt: context.updatedAt,
        priceChange5m: context.priceChange5m,
        openInterestChangePct: context.openInterestChangePct,
        takerBuyRatio: context.takerBuyRatio,
        volumeSpikeRatio: context.volumeSpikeRatio,
      }),
    ];
  }

  private mergeBestSetupDuplicates(events: ScreenerEvent[]): ScreenerEvent[] {
    const deduped = new Map<string, ScreenerEvent>();

    for (const event of events) {
      const eventWindow = Math.floor(event.updatedAt / SCREENER_BREAKOUT_RETENTION_MS);
      const key = `${event.detectorType}:${event.marketMode}:${event.symbol}:${eventWindow}`;
      const current = deduped.get(key);

      if (!current || comparePromotedEvents(event, current) < 0) {
        deduped.set(key, event);
      }
    }

    return [...deduped.values()].sort(comparePromotedEvents);
  }

  private getBreakoutRetentionSignal(samples: SamplePoint[], currentSample: SamplePoint): BreakoutRetentionSignal {
    if (!currentSample.price) {
      return { compressionPct: 0, direction: null, durationMs: 0, referencePrice: null };
    }

    const retentionCutoff = currentSample.timestamp - SCREENER_BREAKOUT_RETENTION_MS;
    const windowStart = currentSample.timestamp - 15 * 60_000;
    const preBreakout = samples.filter(sample => (
      sample.timestamp >= windowStart
      && sample.timestamp < retentionCutoff
      && sample.timestamp <= currentSample.timestamp
    ));
    const retained = samples.filter(sample => (
      sample.timestamp >= retentionCutoff
      && sample.timestamp <= currentSample.timestamp
    ));
    if (preBreakout.length === 0 || retained.length === 0) {
      return { compressionPct: 0, direction: null, durationMs: 0, referencePrice: null };
    }

    const prices = preBreakout.map(sample => sample.price ?? currentSample.price ?? 0);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const baselinePrice = preBreakout[preBreakout.length - 1].price ?? currentSample.price;
    const compressionPct = baselinePrice ? ((high - low) / baselinePrice) * 100 : 0;
    const retainedPrices = retained.map(sample => sample.price ?? currentSample.price ?? 0);

    if (retainedPrices.every(price => price >= high)) {
      return {
        compressionPct,
        direction: 'up',
        durationMs: currentSample.timestamp - retained[0].timestamp,
        referencePrice: high,
      };
    }

    if (retainedPrices.every(price => price <= low)) {
      return {
        compressionPct,
        direction: 'down',
        durationMs: currentSample.timestamp - retained[0].timestamp,
        referencePrice: low,
      };
    }

    return { compressionPct, direction: null, durationMs: 0, referencePrice: null };
  }

  private buildLegacyRow(context: ScreenerFeatureContext): ScreenerRow | null {
    const { state, reasons } = this.classifyState({
      priceChange1m: context.priceChange1m,
      priceChange5m: context.priceChange5m,
      range15mPct: context.range15mPct,
      volumeSpikeRatio: context.volumeSpikeRatio,
      openInterestChangePct: context.openInterestChangePct,
      takerBuyRatio: context.takerBuyRatio,
      liquidationUsd: context.liquidationUsd,
      compressionBreakout: context.compressionBreakout,
    });

    const score = clamp(
      Math.abs(context.priceChange1m) * 12
      + Math.abs(context.priceChange5m) * 6
      + Math.max(0, context.volumeSpikeRatio - 1) * 18
      + Math.max(0, Math.abs(context.openInterestChangePct ?? 0)) * 2,
      0,
      100,
    );
    const takerAdjustedScore = clamp(
      score + (context.takerBuyRatio !== null ? Math.abs(context.takerBuyRatio - 1) * 20 : 0),
      0,
      100,
    );
    const finalScore = clamp(
      takerAdjustedScore
      + (context.compressionBreakout ? 15 : 0)
      + (context.liquidationUsd !== null && context.liquidationUsd > 0 ? 10 : 0),
      0,
      100,
    );

    const conviction = this.classifyConviction({
      state,
      score: finalScore,
      compressionBreakout: context.compressionBreakout,
      liquidationUsd: context.liquidationUsd,
    });

    if (!this.isMeaningfulSetup({
      state,
      score: finalScore,
      compressionBreakout: context.compressionBreakout,
      volumeSpikeRatio: context.volumeSpikeRatio,
      priceChange5m: context.priceChange5m,
      openInterestChangePct: context.openInterestChangePct,
      liquidationUsd: context.liquidationUsd,
    })) {
      return null;
    }

    return {
      id: context.id,
      symbol: context.symbol,
      baseAsset: context.baseAsset,
      marketType: context.marketType,
      primaryExchange: context.primaryExchange,
      lastPrice: context.lastPrice,
      priceChange1m: context.priceChange1m,
      priceChange5m: context.priceChange5m,
      priceChange15m: context.priceChange15m,
      range15mPct: context.range15mPct,
      volumeNow: context.volumeNow,
      volumeAvg: context.volumeAvg,
      volumeSpikeRatio: context.volumeSpikeRatio,
      openInterestNow: context.openInterestNow,
      openInterestChangePct: context.openInterestChangePct,
      takerBuyRatio: context.takerBuyRatio,
      liquidationUsd: context.liquidationUsd,
      compressionBreakout: context.compressionBreakout,
      conviction,
      score: finalScore,
      state,
      reasons,
      updatedAt: context.updatedAt,
    };
  }

  private buildSummary(rows: ScreenerRow[]): ScreenerSummary {
    return {
      totalRows: rows.length,
      momentumCount: rows.filter(row => row.state === 'Momentum').length,
      breakoutWatchCount: rows.filter(row => row.state === 'Breakout Watch').length,
      compressionBreakoutCount: rows.filter(row => row.compressionBreakout).length,
      oiBuildCount: rows.filter(row => row.state === 'OI Build' || row.state === 'OI Unwind').length,
      volumeExpansionCount: rows.filter(row => row.state === 'Volume Expansion').length,
      shortSqueezeRiskCount: rows.filter(row => row.state === 'Short Squeeze Risk').length,
      longLiquidationRiskCount: rows.filter(row => row.state === 'Long Liquidation Risk').length,
      averageScore: rows.length > 0 ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0,
      universeSize: SCREENER_UNIVERSE_SYMBOLS.length,
    };
  }

  private classifyState(input: {
    priceChange1m: number;
    priceChange5m: number;
    range15mPct: number;
    volumeSpikeRatio: number;
    openInterestChangePct: number | null;
    takerBuyRatio: number | null;
    liquidationUsd: number | null;
    compressionBreakout: boolean;
  }): { state: ScreenerState | null; reasons: string[] } {
    const reasons: string[] = [];

    if (Math.abs(input.priceChange1m) >= SCREENER_MOMENTUM_MIN_PCT_1M || Math.abs(input.priceChange5m) >= SCREENER_MOMENTUM_MIN_PCT_5M) {
      reasons.push('Price is moving unusually fast in a short window');
    }

    if (input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO) {
      reasons.push('Current rolling volume is well above recent baseline');
    }

    if (input.compressionBreakout) {
      reasons.push('The move is breaking out after a relatively compressed 15-minute range');
    } else if (input.range15mPct > 0 && input.range15mPct <= 4) {
      reasons.push('Recent 15-minute range has been relatively compressed');
    }

    if (input.openInterestChangePct !== null && Math.abs(input.openInterestChangePct) >= SCREENER_OI_BUILD_MIN_PCT) {
      reasons.push('Open interest is changing meaningfully relative to recent baseline');
    }

    if (input.takerBuyRatio !== null && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH) {
      reasons.push('Aggressive taker buying is dominating recent futures flow');
    } else if (input.takerBuyRatio !== null && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW) {
      reasons.push('Aggressive taker selling is dominating recent futures flow');
    }

    if (input.liquidationUsd !== null && input.liquidationUsd > 0) {
      reasons.push('Liquidation-style pressure proxy is elevated from price, OI, volume and taker flow');
    }

    if (input.compressionBreakout) {
      return { state: 'Breakout Watch', reasons };
    }

    if (
      input.takerBuyRatio !== null
      && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH
      && input.priceChange5m > 0
      && input.openInterestChangePct !== null
      && input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT
    ) {
      return { state: 'Short Squeeze Risk', reasons };
    }

    if (
      input.takerBuyRatio !== null
      && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW
      && input.priceChange5m < 0
      && input.openInterestChangePct !== null
      && input.openInterestChangePct <= -SCREENER_OI_BUILD_MIN_PCT
    ) {
      return { state: 'Long Liquidation Risk', reasons };
    }

    if (
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO
      && Math.abs(input.priceChange5m) >= SCREENER_BREAKOUT_MIN_PCT
    ) {
      return { state: 'Breakout Watch', reasons };
    }

    if (
      input.openInterestChangePct !== null
      && input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT
      && input.priceChange5m > 0
    ) {
      return { state: 'OI Build', reasons };
    }

    if (
      input.openInterestChangePct !== null
      && input.openInterestChangePct <= -SCREENER_OI_BUILD_MIN_PCT
    ) {
      return { state: 'OI Unwind', reasons };
    }

    if (input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO) {
      return { state: 'Volume Expansion', reasons };
    }

    if (Math.abs(input.priceChange1m) >= SCREENER_MOMENTUM_MIN_PCT_1M || Math.abs(input.priceChange5m) >= SCREENER_MOMENTUM_MIN_PCT_5M) {
      return { state: 'Momentum', reasons };
    }

    return { state: null, reasons };
  }

  private estimateLiquidationPressureUsd(input: {
    volumeNow: number;
    priceChange5m: number;
    openInterestChangePct: number | null;
    takerBuyRatio: number | null;
  }): number | null {
    if (input.openInterestChangePct === null || input.takerBuyRatio === null) return null;

    const bearishFlush =
      input.priceChange5m <= -4
      && input.openInterestChangePct <= -3
      && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW;
    const bullishSqueeze =
      input.priceChange5m >= 4
      && input.openInterestChangePct <= -3
      && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH;

    if (!bearishFlush && !bullishSqueeze) return null;

    const multiplier = clamp(
      Math.abs(input.priceChange5m) / 5 + Math.abs(input.openInterestChangePct) / 6 + Math.abs(input.takerBuyRatio - 1),
      1,
      4,
    );

    return input.volumeNow * multiplier;
  }

  private classifyConviction(input: {
    state: ScreenerState | null;
    score: number;
    compressionBreakout: boolean;
    liquidationUsd: number | null;
  }): ScreenerConviction {
    if (
      input.state === 'Short Squeeze Risk'
      || input.state === 'Long Liquidation Risk'
      || input.score >= 80
      || (input.liquidationUsd !== null && input.liquidationUsd > 0)
    ) {
      return 'extreme';
    }

    if (
      input.state === 'Breakout Watch'
      || input.state === 'OI Build'
      || input.state === 'OI Unwind'
      || input.score >= 60
      || input.compressionBreakout
    ) {
      return 'strong';
    }

    return 'watch';
  }

  private isMeaningfulSetup(input: {
    state: ScreenerState | null;
    score: number;
    compressionBreakout: boolean;
    volumeSpikeRatio: number;
    priceChange5m: number;
    openInterestChangePct: number | null;
    liquidationUsd: number | null;
  }): boolean {
    if (input.state) return true;
    if (input.compressionBreakout) return true;
    if (input.score >= 55) return true;
    if (input.volumeSpikeRatio >= 2) return true;
    if (Math.abs(input.priceChange5m) >= 3.5) return true;
    if (Math.abs(input.openInterestChangePct ?? 0) >= 3) return true;
    if (input.liquidationUsd !== null && input.liquidationUsd > 0) return true;
    return false;
  }
}
