import type { ScreenerEvent } from '@crypto-screener/shared';
import {
  SCREENER_OI_BUILD_MIN_PCT,
  SCREENER_OI_BUILD_WATCH_PCT,
} from '../screener.config';

export interface FuturesOiBuildDetectorInput {
  symbol: string;
  primaryExchange: string;
  updatedAt: number;
  priceChange5m: number;
  openInterestNow: number | null;
  openInterestChangePct: number | null;
  volumeSpikeRatio: number;
  takerBuyRatio: number | null;
}

export class FuturesOiBuildDetector {
  detect(input: FuturesOiBuildDetectorInput): ScreenerEvent[] {
    if (input.openInterestNow === null || input.openInterestChangePct === null) return [];

    const strongBuild =
      input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT
      && Math.abs(input.priceChange5m) >= 1;
    const watchBuild =
      input.openInterestChangePct >= SCREENER_OI_BUILD_WATCH_PCT
      && Math.abs(input.priceChange5m) >= 0.5;

    if (!strongBuild && !watchBuild) return [];

    const promotionTier =
      !strongBuild
        ? 'watch'
        : input.openInterestChangePct >= SCREENER_OI_BUILD_MIN_PCT * 2 && input.volumeSpikeRatio >= 2
        ? 'rare'
        : 'actionable';
    const directionLabel = input.priceChange5m >= 0 ? 'long build pressure' : 'short build pressure';

    return [
      {
        id: `futures-oi-build:${input.symbol}:${input.updatedAt}`,
        symbol: input.symbol,
        marketMode: 'futures',
        detectorType: 'futures-oi-build',
        promotionTier,
        strengthTier:
          promotionTier === 'rare'
            ? 'event-live'
            : promotionTier === 'actionable'
              ? 'actionable'
              : 'watching',
        headline: `${input.symbol} futures OI build`,
        reason: `Open interest is up ${input.openInterestChangePct.toFixed(1)}% while price is showing ${directionLabel}.`,
        riskNote: 'If open interest stalls or reverses, the build can unwind quickly.',
        primaryExchange: input.primaryExchange,
        chartTimeframe: '5m',
        supportingMetrics: {
          priceChange5m: input.priceChange5m,
          openInterestNow: input.openInterestNow,
          openInterestChangePct: input.openInterestChangePct,
          volumeSpikeRatio: input.volumeSpikeRatio,
          takerBuyRatio: input.takerBuyRatio,
        },
        confirms: [
          'Open interest expanded against a recent baseline.',
          'Price is already moving in the same direction as the build.',
        ],
        invalidates: [
          'Open interest cools back below the build threshold.',
          'Price snaps back against the move.',
        ],
        updatedAt: input.updatedAt,
      },
    ];
  }
}
