import type { ScreenerEvent } from '@crypto-screener/shared';
import {
  SCREENER_BREAKOUT_MIN_PCT,
  SCREENER_BREAKOUT_RETENTION_MS,
  SCREENER_VOLUME_SPIKE_MIN_RATIO,
} from '../screener.config';

export interface SpotBreakoutPressureDetectorInput {
  symbol: string;
  primaryExchange: string;
  lastPrice: number;
  updatedAt: number;
  priceChange5m: number;
  volumeSpikeRatio: number;
  volumeNow: number;
  compressionPct: number;
  breakoutRetentionMs: number;
  breakoutDirection: 'up' | 'down' | null;
  breakoutReferencePrice: number | null;
}

export class SpotBreakoutPressureDetector {
  detect(input: SpotBreakoutPressureDetectorInput): ScreenerEvent[] {
    if (!input.breakoutDirection || input.breakoutReferencePrice === null) return [];
    if (input.compressionPct > SCREENER_BREAKOUT_MIN_PCT) return [];
    if (Math.abs(input.priceChange5m) < SCREENER_BREAKOUT_MIN_PCT) return [];
    if (input.volumeSpikeRatio < SCREENER_VOLUME_SPIKE_MIN_RATIO) return [];
    if (input.breakoutRetentionMs < SCREENER_BREAKOUT_RETENTION_MS) return [];

    const promotionTier =
      input.volumeSpikeRatio >= SCREENER_VOLUME_SPIKE_MIN_RATIO + 1
        ? 'rare'
        : 'actionable';
    const directionLabel = input.breakoutDirection === 'up' ? 'upside' : 'downside';
    const holdLabel = input.breakoutDirection === 'up' ? 'above' : 'below';
    const invalidationLabel =
      input.breakoutDirection === 'up'
        ? 'Price closes back inside the prior range.'
        : 'Price closes back above the breakdown level.';

    return [
      {
        id: `spot-breakout-pressure:${input.symbol}:${input.updatedAt}`,
        symbol: input.symbol,
        marketMode: 'spot',
        detectorType: 'spot-breakout-pressure',
        promotionTier,
        strengthTier: promotionTier === 'rare' ? 'event-live' : 'actionable',
        headline: `${input.symbol} breakout pressure on ${input.primaryExchange}`,
        reason: `${directionLabel} break is holding after compression with ${input.volumeSpikeRatio.toFixed(1)}x rolling volume.`,
        riskNote: `Needs to hold ${holdLabel} ${input.breakoutReferencePrice.toFixed(4)} or the breakout can fade quickly.`,
        primaryExchange: input.primaryExchange,
        chartTimeframe: '5m',
        supportingMetrics: {
          lastPrice: input.lastPrice,
          priceChange5m: input.priceChange5m,
          volumeNow: input.volumeNow,
          volumeSpikeRatio: input.volumeSpikeRatio,
          compressionPct: input.compressionPct,
          breakoutRetentionMs: input.breakoutRetentionMs,
          breakoutReferencePrice: input.breakoutReferencePrice,
        },
        confirms: [
          'Compression stayed tight before the expansion.',
          'Rolling quote volume expanded during the move.',
          `Price held ${holdLabel} the broken range for the retention window.`,
        ],
        invalidates: [
          invalidationLabel,
          'Rolling quote volume cools back toward baseline.',
        ],
        updatedAt: input.updatedAt,
      },
    ];
  }
}
