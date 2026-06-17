import type { ScreenerEvent } from '@crypto-screener/shared';
import {
  SCREENER_BREAKOUT_MIN_PCT,
  SCREENER_BREAKOUT_WATCH_MIN_PCT,
  SCREENER_OI_BUILD_MIN_PCT,
  SCREENER_TAKER_IMBALANCE_HIGH,
  SCREENER_TAKER_IMBALANCE_LOW,
  SCREENER_VOLUME_SPIKE_MIN_RATIO,
  SCREENER_VOLUME_SPIKE_WATCH_RATIO,
} from '../screener.config';

export interface FuturesSqueezeRiskDetectorInput {
  symbol: string;
  primaryExchange: string;
  updatedAt: number;
  priceChange5m: number;
  openInterestChangePct: number | null;
  takerBuyRatio: number | null;
  volumeSpikeRatio: number;
}

export class FuturesSqueezeRiskDetector {
  detect(input: FuturesSqueezeRiskDetectorInput): ScreenerEvent[] {
    if (input.openInterestChangePct === null || input.takerBuyRatio === null) return [];
    const strongBullish =
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO
      && input.priceChange5m >= SCREENER_BREAKOUT_MIN_PCT
      && input.takerBuyRatio >= SCREENER_TAKER_IMBALANCE_HIGH
      && input.openInterestChangePct <= 0;
    const strongBearish =
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO
      && input.priceChange5m <= -SCREENER_BREAKOUT_MIN_PCT
      && input.takerBuyRatio <= SCREENER_TAKER_IMBALANCE_LOW
      && input.openInterestChangePct <= 0;
    const watchBullish =
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_WATCH_RATIO
      && input.priceChange5m >= SCREENER_BREAKOUT_WATCH_MIN_PCT
      && input.takerBuyRatio >= 1.15
      && input.openInterestChangePct <= 0.5;
    const watchBearish =
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_WATCH_RATIO
      && input.priceChange5m <= -SCREENER_BREAKOUT_WATCH_MIN_PCT
      && input.takerBuyRatio <= 0.9
      && input.openInterestChangePct <= 0.5;

    if (!strongBullish && !strongBearish && !watchBullish && !watchBearish) return [];

    const bullish = strongBullish || watchBullish;
    const directionLabel = bullish ? 'short squeeze risk' : 'long squeeze risk';
    const strongSignal = strongBullish || strongBearish;
    const promotionTier =
      !strongSignal
        ? 'watch'
        : Math.abs(input.priceChange5m) >= SCREENER_BREAKOUT_MIN_PCT + 1
          || input.openInterestChangePct <= -SCREENER_OI_BUILD_MIN_PCT
          ? 'rare'
          : 'actionable';

    return [
      {
        id: `futures-squeeze-risk:${input.symbol}:${input.updatedAt}`,
        symbol: input.symbol,
        marketMode: 'futures',
        detectorType: 'futures-squeeze-risk',
        promotionTier,
        strengthTier: promotionTier === 'watch' ? 'watching' : 'high-risk',
        headline: `${input.symbol} futures squeeze risk`,
        reason: `${directionLabel} is building with ${input.priceChange5m.toFixed(1)}% price travel, ${input.volumeSpikeRatio.toFixed(1)}x volume, and aggressive taker flow.`,
        riskNote: 'Squeeze conditions can reverse violently once the forced flow is exhausted.',
        primaryExchange: input.primaryExchange,
        chartTimeframe: '5m',
        supportingMetrics: {
          priceChange5m: input.priceChange5m,
          openInterestChangePct: input.openInterestChangePct,
          takerBuyRatio: input.takerBuyRatio,
          volumeSpikeRatio: input.volumeSpikeRatio,
        },
        confirms: [
          'Price acceleration is already above the breakout threshold.',
          'Taker flow is skewed hard in one direction.',
          'Open interest is not expanding with the move.',
        ],
        invalidates: [
          'Taker imbalance normalizes back toward 1.0.',
          'Open interest starts rebuilding with the move instead of clearing.',
        ],
        updatedAt: input.updatedAt,
      },
    ];
  }
}
