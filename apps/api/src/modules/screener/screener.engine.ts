import { Injectable } from '@nestjs/common';
import type { Ticker } from '@crypto-screener/shared';
import {
  SCREENER_BREAKOUT_MIN_PCT,
  SCREENER_MOMENTUM_MIN_PCT_1M,
  SCREENER_MOMENTUM_MIN_PCT_5M,
  SCREENER_OI_BUILD_MIN_PCT,
  SCREENER_TAKER_IMBALANCE_HIGH,
  SCREENER_TAKER_IMBALANCE_LOW,
  SCREENER_UNIVERSE_SYMBOLS,
  SCREENER_VOLUME_SPIKE_MIN_RATIO,
} from './screener.config';
import { ScreenerStore } from './screener.store';
import type { ScreenerConviction, ScreenerRow, ScreenerState, ScreenerSummary } from './screener.types';

interface SamplePoint {
  timestamp: number;
  price?: number;
  quoteVolume24h?: number;
  value?: number;
}

function percentChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

function nearestSampleAtOrBefore<T extends SamplePoint>(samples: T[], targetTs: number): T | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].timestamp <= targetTs) return samples[index];
  }
  return samples[0] ?? null;
}

function quoteVolumeDelta(samples: SamplePoint[], endTs: number, windowMs: number): number {
  const latest = nearestSampleAtOrBefore(samples, endTs);
  const previous = nearestSampleAtOrBefore(samples, endTs - windowMs);
  if (!latest || !previous) return 0;

  const latestVolume = latest.quoteVolume24h ?? 0;
  const previousVolume = previous.quoteVolume24h ?? 0;
  return Math.max(0, latestVolume - previousVolume);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rangePct(samples: SamplePoint[], now: number, windowMs: number, latestPrice: number): number {
  const relevant = samples.filter(sample => sample.timestamp >= now - windowMs);
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

@Injectable()
export class ScreenerEngine {
  constructor(private readonly store: ScreenerStore) {}

  build(now = Date.now()): { rows: ScreenerRow[]; summary: ScreenerSummary } {
    const rows: ScreenerRow[] = [];

    for (const symbol of SCREENER_UNIVERSE_SYMBOLS) {
      const ticker = this.store.getLatestTicker(symbol);
      if (!ticker) continue;

      const row = this.buildRowFromTicker(ticker, now);
      if (row) rows.push(row);
    }

    rows.sort(
      (a, b) =>
        statePriority(b.state) - statePriority(a.state)
        || convictionPriority(b.conviction) - convictionPriority(a.conviction)
        || b.score - a.score
        || b.updatedAt - a.updatedAt,
    );

    const summary: ScreenerSummary = {
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

    return { rows, summary };
  }

  private buildRowFromTicker(ticker: Ticker, now: number): ScreenerRow | null {
    const marketType = ticker.marketType ?? 'spot';
    const samples = this.store.getTickerSamples(ticker.exchange, ticker.symbol, marketType);
    if (samples.length === 0) return null;

    const latest = samples[samples.length - 1];
    const sample1m = nearestSampleAtOrBefore(samples, now - 60_000);
    const sample5m = nearestSampleAtOrBefore(samples, now - 5 * 60_000);
    const sample15m = nearestSampleAtOrBefore(samples, now - 15 * 60_000);

    const priceChange1m = sample1m ? percentChange(sample1m.price ?? latest.price, latest.price) : 0;
    const priceChange5m = sample5m ? percentChange(sample5m.price ?? latest.price, latest.price) : 0;
    const priceChange15m = sample15m ? percentChange(sample15m.price ?? latest.price, latest.price) : 0;
    const range15mPct = rangePct(samples, now, 15 * 60_000, latest.price);

    const volumeNow = quoteVolumeDelta(samples, now, 60_000);
    const previousMinuteDeltas = [2, 3, 4, 5]
      .map(multiplier => quoteVolumeDelta(samples, now - (multiplier - 1) * 60_000, 60_000))
      .filter(value => value > 0);
    const volumeAvg =
      previousMinuteDeltas.length > 0
        ? previousMinuteDeltas.reduce((sum, value) => sum + value, 0) / previousMinuteDeltas.length
        : volumeNow;
    const volumeSpikeRatio = volumeAvg > 0 ? volumeNow / volumeAvg : 1;

    const openInterestSamples = this.store.getOpenInterestSamples(ticker.exchange, ticker.symbol);
    const openInterestNow = openInterestSamples.length > 0 ? openInterestSamples[openInterestSamples.length - 1].value : null;
    const openInterestBase = nearestSampleAtOrBefore(openInterestSamples, now - 5 * 60_000);
    const openInterestChangePct =
      openInterestNow !== null && openInterestBase?.value
        ? percentChange(openInterestBase.value, openInterestNow)
        : null;
    const takerSamples = this.store.getTakerRatioSamples(ticker.exchange, ticker.symbol);
    const takerBuyRatio = takerSamples.length > 0 ? takerSamples[takerSamples.length - 1].value : null;
    const liquidationUsd = this.estimateLiquidationPressureUsd({
      volumeNow,
      priceChange5m,
      openInterestChangePct,
      takerBuyRatio,
    });
    const compressionBreakout =
      range15mPct <= 4
      && Math.abs(priceChange5m) >= SCREENER_BREAKOUT_MIN_PCT
      && volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO;

    const { state, reasons } = this.classifyState({
      priceChange1m,
      priceChange5m,
      range15mPct,
      volumeSpikeRatio,
      openInterestChangePct,
      takerBuyRatio,
      liquidationUsd,
      compressionBreakout,
    });

    const score = clamp(
      Math.abs(priceChange1m) * 12
      + Math.abs(priceChange5m) * 6
      + Math.max(0, volumeSpikeRatio - 1) * 18
      + Math.max(0, Math.abs(openInterestChangePct ?? 0)) * 2,
      0,
      100,
    );
    const takerAdjustedScore = clamp(
      score + (takerBuyRatio !== null ? Math.abs(takerBuyRatio - 1) * 20 : 0),
      0,
      100,
    );
    const finalScore = clamp(
      takerAdjustedScore
      + (compressionBreakout ? 15 : 0)
      + (liquidationUsd !== null && liquidationUsd > 0 ? 10 : 0),
      0,
      100,
    );

    const conviction = this.classifyConviction({
      state,
      score: finalScore,
      compressionBreakout,
      liquidationUsd,
    });

    if (!this.isMeaningfulSetup({
      state,
      score: finalScore,
      compressionBreakout,
      volumeSpikeRatio,
      priceChange5m,
      openInterestChangePct,
      liquidationUsd,
    })) {
      return null;
    }

    return {
      id: `${ticker.exchange}:${marketType}:${ticker.symbol}`,
      symbol: ticker.symbol,
      baseAsset: ticker.symbol.split('/')[0] ?? ticker.symbol,
      marketType,
      primaryExchange: ticker.exchange,
      lastPrice: ticker.lastPrice,
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
      compressionBreakout,
      conviction,
      score: finalScore,
      state,
      reasons,
      updatedAt: latest.timestamp,
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
      return {
        state: 'Breakout Watch',
        reasons,
      };
    }

    if (
      input.takerBuyRatio !== null
      && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH
      && input.priceChange5m > 0
      && input.openInterestChangePct !== null
      && input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT
    ) {
      return {
        state: 'Short Squeeze Risk',
        reasons,
      };
    }

    if (
      input.takerBuyRatio !== null
      && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW
      && input.priceChange5m < 0
      && input.openInterestChangePct !== null
      && input.openInterestChangePct <= -SCREENER_OI_BUILD_MIN_PCT
    ) {
      return {
        state: 'Long Liquidation Risk',
        reasons,
      };
    }

    if (
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO
      && Math.abs(input.priceChange5m) >= SCREENER_BREAKOUT_MIN_PCT
    ) {
      return {
        state: 'Breakout Watch',
        reasons,
      };
    }

    if (
      input.openInterestChangePct !== null
      && input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT
      && input.priceChange5m > 0
    ) {
      return {
        state: 'OI Build',
        reasons,
      };
    }

    if (
      input.openInterestChangePct !== null
      && input.openInterestChangePct <= -SCREENER_OI_BUILD_MIN_PCT
    ) {
      return {
        state: 'OI Unwind',
        reasons,
      };
    }

    if (input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO) {
      return {
        state: 'Volume Expansion',
        reasons,
      };
    }

    if (Math.abs(input.priceChange1m) >= SCREENER_MOMENTUM_MIN_PCT_1M || Math.abs(input.priceChange5m) >= SCREENER_MOMENTUM_MIN_PCT_5M) {
      return {
        state: 'Momentum',
        reasons,
      };
    }

    return {
      state: null,
      reasons,
    };
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
