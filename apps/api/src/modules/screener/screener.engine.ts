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
import type { ScreenerRow, ScreenerState, ScreenerSummary } from './screener.types';

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

    rows.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

    const summary: ScreenerSummary = {
      totalRows: rows.length,
      momentumCount: rows.filter(row => row.state === 'Momentum').length,
      breakoutWatchCount: rows.filter(row => row.state === 'Breakout Watch').length,
      oiBuildCount: rows.filter(row => row.state === 'OI Build' || row.state === 'OI Unwind').length,
      volumeExpansionCount: rows.filter(row => row.state === 'Volume Expansion').length,
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

    const { state, reasons } = this.classifyState({
      priceChange1m,
      priceChange5m,
      volumeSpikeRatio,
      openInterestChangePct,
      takerBuyRatio,
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
      volumeNow,
      volumeAvg,
      volumeSpikeRatio,
      openInterestNow,
      openInterestChangePct,
      takerBuyRatio,
      liquidationUsd: null,
      score: takerAdjustedScore,
      state,
      reasons,
      updatedAt: latest.timestamp,
    };
  }

  private classifyState(input: {
    priceChange1m: number;
    priceChange5m: number;
    volumeSpikeRatio: number;
    openInterestChangePct: number | null;
    takerBuyRatio: number | null;
  }): { state: ScreenerState | null; reasons: string[] } {
    const reasons: string[] = [];

    if (Math.abs(input.priceChange1m) >= SCREENER_MOMENTUM_MIN_PCT_1M || Math.abs(input.priceChange5m) >= SCREENER_MOMENTUM_MIN_PCT_5M) {
      reasons.push('Price is moving unusually fast in a short window');
    }

    if (input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO) {
      reasons.push('Current rolling volume is well above recent baseline');
    }

    if (input.openInterestChangePct !== null && Math.abs(input.openInterestChangePct) >= SCREENER_OI_BUILD_MIN_PCT) {
      reasons.push('Open interest is changing meaningfully relative to recent baseline');
    }

    if (input.takerBuyRatio !== null && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH) {
      reasons.push('Aggressive taker buying is dominating recent futures flow');
    } else if (input.takerBuyRatio !== null && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW) {
      reasons.push('Aggressive taker selling is dominating recent futures flow');
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
}
