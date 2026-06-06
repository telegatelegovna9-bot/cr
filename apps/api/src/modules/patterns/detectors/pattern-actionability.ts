import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';

const TIMEFRAME_TO_MS: Record<PatternTimeframe, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

interface ActionabilityResult {
  keep: boolean;
  quality: number;
}

function projectLineValueAtTime(
  fromTime: number,
  fromPrice: number,
  toTime: number,
  toPrice: number,
  targetTime: number,
): number | null {
  const deltaTime = toTime - fromTime;
  if (deltaTime === 0) return null;
  const slope = (toPrice - fromPrice) / deltaTime;
  return fromPrice + slope * (targetTime - fromTime);
}

function findBarIndexByTime(candles: DetectorCandle[], targetTime: number): number {
  const exact = candles.findIndex(candle => candle.time === targetTime);
  if (exact >= 0) return exact;

  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index]!.time <= targetTime) {
      return index;
    }
  }

  return 0;
}

function scoreTriangleActionability(
  candidate: PatternCandidate,
  candles: DetectorCandle[],
  timeframe: PatternTimeframe,
): ActionabilityResult {
  const currentCandle = candles[candles.length - 1];
  if (!currentCandle || candidate.geometry.lines.length < 2) {
    return { keep: false, quality: candidate.quality };
  }

  const barsSinceCompletion =
    candles.length - 1 - findBarIndexByTime(candles, candidate.geometry.anchorTimeTo);
  if (barsSinceCompletion > 6) {
    return { keep: false, quality: candidate.quality };
  }

  const [upperLine, lowerLine] = candidate.geometry.lines;
  const upper = projectLineValueAtTime(
    upperLine!.points[0].time,
    upperLine!.points[0].price,
    upperLine!.points[1].time,
    upperLine!.points[1].price,
    currentCandle.time,
  );
  const lower = projectLineValueAtTime(
    lowerLine!.points[0].time,
    lowerLine!.points[0].price,
    lowerLine!.points[1].time,
    lowerLine!.points[1].price,
    currentCandle.time,
  );

  if (upper == null || lower == null || upper <= lower) {
    return { keep: false, quality: candidate.quality };
  }

  const envelopeHeight = Math.max(upper - lower, (candidate.geometry.priceMax - candidate.geometry.priceMin) * 0.18);
  const currentPrice = currentCandle.close;
  const overshoot =
    currentPrice > upper ? currentPrice - upper : currentPrice < lower ? lower - currentPrice : 0;

  if (overshoot > envelopeHeight * 0.35) {
    return { keep: false, quality: candidate.quality };
  }

  const spanMs = Math.max(currentCandle.time - candidate.geometry.anchorTimeFrom, TIMEFRAME_TO_MS[timeframe]);
  const freshnessPenalty = Math.min(12, barsSinceCompletion * 2);
  const proximityBonus = Math.max(0, Math.round(((envelopeHeight - overshoot) / envelopeHeight) * 12));
  const spanBonus = Math.min(10, Math.round(spanMs / TIMEFRAME_TO_MS[timeframe] / 6));

  return {
    keep: true,
    quality: clampQuality(candidate.quality - freshnessPenalty + proximityBonus + spanBonus),
  };
}

function scoreTrendlineActionability(
  candidate: PatternCandidate,
  candles: DetectorCandle[],
  timeframe: PatternTimeframe,
): ActionabilityResult {
  const currentCandle = candles[candles.length - 1];
  const trendline = candidate.geometry.lines[0];
  if (!currentCandle || !trendline) {
    return { keep: false, quality: candidate.quality };
  }

  const barsSinceCompletion =
    candles.length - 1 - findBarIndexByTime(candles, candidate.geometry.anchorTimeTo);
  if (barsSinceCompletion > 8) {
    return { keep: false, quality: candidate.quality };
  }

  const projectedPrice = projectLineValueAtTime(
    trendline.points[0].time,
    trendline.points[0].price,
    trendline.points[1].time,
    trendline.points[1].price,
    currentCandle.time,
  );
  if (projectedPrice == null) {
    return { keep: false, quality: candidate.quality };
  }

  const structureRange = Math.max(candidate.geometry.priceMax - candidate.geometry.priceMin, currentCandle.close * 0.01);
  const breakoutTolerance = structureRange * 0.06;
  if (currentCandle.close > projectedPrice + breakoutTolerance) {
    return { keep: false, quality: candidate.quality };
  }

  const distance = Math.abs(currentCandle.close - projectedPrice);
  if (distance > structureRange * 0.18) {
    return { keep: false, quality: candidate.quality };
  }

  const recencyPenalty = Math.min(10, Math.round(barsSinceCompletion * 1.5));
  const touchBonus = Math.min(12, candidate.geometry.pivots.length);
  const proximityBonus = Math.max(0, Math.round(((structureRange * 0.18 - distance) / (structureRange * 0.18)) * 10));
  const spanBars = Math.max(
    1,
    Math.round((candidate.geometry.anchorTimeTo - candidate.geometry.anchorTimeFrom) / TIMEFRAME_TO_MS[timeframe]),
  );
  const spanBonus = Math.min(8, Math.round(spanBars / 4));

  return {
    keep: true,
    quality: clampQuality(candidate.quality - recencyPenalty + touchBonus + proximityBonus + spanBonus),
  };
}

export function refinePatternActionability(
  candidate: PatternCandidate,
  candles: DetectorCandle[],
  timeframe: PatternTimeframe,
): ActionabilityResult {
  if (candidate.kind === 'triangle') {
    return scoreTriangleActionability(candidate, candles, timeframe);
  }

  if (candidate.kind === 'trendline') {
    return scoreTrendlineActionability(candidate, candles, timeframe);
  }

  // Cascade is intentionally disabled: detector produces too many false positives
  // and the geometry rendering is not yet production-ready.
  // Re-enable by implementing scoreCascadeActionability() here.
  return { keep: false, quality: candidate.quality };
}
