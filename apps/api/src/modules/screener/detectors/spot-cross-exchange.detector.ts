import type { ScreenerEvent } from '@crypto-screener/shared';
import {
  SCREENER_DIVERGENCE_MIN_BPS,
  SCREENER_DIVERGENCE_WATCH_BPS,
} from '../screener.config';

export interface SpotCrossExchangeDetectorInput {
  symbol: string;
  updatedAt: number;
  outlierExchange: string | null;
  outlierPrice: number | null;
  medianPrice: number;
  deviationBps: number;
  exchangeCount: number;
}

export class SpotCrossExchangeDetector {
  detect(input: SpotCrossExchangeDetectorInput): ScreenerEvent[] {
    if (!input.outlierExchange || input.outlierPrice === null) return [];
    if (input.exchangeCount < 2) return [];
    if (Math.abs(input.deviationBps) < SCREENER_DIVERGENCE_WATCH_BPS) return [];

    const directionLabel = input.deviationBps > 0 ? 'premium' : 'discount';
    const promotionTier =
      Math.abs(input.deviationBps) >= SCREENER_DIVERGENCE_MIN_BPS
        ? 'actionable'
        : 'watch';

    return [
      {
        id: `spot-cross-exchange:${input.symbol}:${input.updatedAt}`,
        symbol: input.symbol,
        marketMode: 'spot',
        detectorType: 'spot-cross-exchange',
        promotionTier,
        strengthTier: 'watching',
        headline: `${input.symbol} diverging across spot venues`,
        reason: `${input.outlierExchange} is trading at a ${Math.abs(input.deviationBps).toFixed(0)} bps ${directionLabel} to the multi-exchange median.`,
        riskNote: 'Cross-exchange dislocations can normalize quickly once the outlier venue catches up.',
        primaryExchange: input.outlierExchange,
        chartTimeframe: '1m',
        supportingMetrics: {
          outlierPrice: input.outlierPrice,
          medianPrice: input.medianPrice,
          deviationBps: input.deviationBps,
          exchangeCount: input.exchangeCount,
        },
        confirms: [
          'More than one exchange has a live reference price.',
          'The price gap is above the divergence threshold.',
        ],
        invalidates: [
          'The outlier exchange converges back toward the median.',
        ],
        updatedAt: input.updatedAt,
      },
    ];
  }
}
