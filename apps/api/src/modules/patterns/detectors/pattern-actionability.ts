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

function findBarIndexByTime(candles: DetectorCandle[], targetTime: number): number {
  const exact = candles.findIndex(candle => candle.time === targetTime);
  if (exact >= 0) return exact;

  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index]!.time <= targetTime) return index;
  }

  return 0;
}

function getPrimaryLevel(candidate: PatternCandidate): number | null {
  const line = candidate.geometry.lines[0];
  if (!line) return null;
  return line.points[0]?.price ?? null;
}

export function refinePatternActionability(
  candidate: PatternCandidate,
  candles: DetectorCandle[],
  timeframe: PatternTimeframe,
): ActionabilityResult {
  const current = candles[candles.length - 1];
  const level = getPrimaryLevel(candidate);
  if (!current || level == null) {
    return { keep: false, quality: candidate.quality };
  }

  const barsSinceEvent = candles.length - 1 - findBarIndexByTime(candles, candidate.geometry.anchorTimeTo);
  const structureRange = Math.max(candidate.geometry.priceMax - candidate.geometry.priceMin, level * 0.006);
  const distance = Math.abs(current.close - level);

  const freshnessLimit =
    candidate.kind === 'liquidity_sweep'
      ? 1
      : candidate.kind === 'retest'
        ? 2
        : candidate.kind === 'structure_break'
          ? 1
          : candidate.status === 'forming'
            ? 2
            : 1;
  if (barsSinceEvent > freshnessLimit) {
    return { keep: false, quality: candidate.quality };
  }

  if (distance > structureRange * (candidate.status === 'forming' ? 1.1 : 0.9)) {
    return { keep: false, quality: candidate.quality };
  }

  if (candidate.kind === 'breakout' || candidate.kind === 'structure_break') {
    const eventCandle = candles[findBarIndexByTime(candles, candidate.geometry.anchorTimeTo)]!;
    if (eventCandle.close >= level && current.close < level - structureRange * 0.12) {
      return { keep: false, quality: candidate.quality };
    }
    if (eventCandle.close <= level && current.close > level + structureRange * 0.12) {
      return { keep: false, quality: candidate.quality };
    }
  }

  if (candidate.kind === 'retest') {
    const eventCandle = candles[findBarIndexByTime(candles, candidate.geometry.anchorTimeTo)]!;
    if (eventCandle.close >= level && current.close < level - structureRange * 0.08) {
      return { keep: false, quality: candidate.quality };
    }
    if (eventCandle.close <= level && current.close > level + structureRange * 0.08) {
      return { keep: false, quality: candidate.quality };
    }
  }

  if (candidate.kind === 'liquidity_sweep') {
    if (distance > structureRange * 1.2) {
      return { keep: false, quality: candidate.quality };
    }
  }

  const agePenalty = Math.min(18, barsSinceEvent * 4);
  const proximityBonus = Math.max(0, Math.round(((structureRange - distance) / structureRange) * 18));
  const spanBars = Math.max(
    1,
    Math.round((candidate.geometry.anchorTimeTo - candidate.geometry.anchorTimeFrom) / TIMEFRAME_TO_MS[timeframe]),
  );
  const spanBonus = Math.min(6, Math.round(spanBars / 4));
  const statusBonus = candidate.status === 'forming' ? 6 : 0;

  return {
    keep: true,
    quality: clampQuality(candidate.quality - agePenalty + proximityBonus + spanBonus + statusBonus),
  };
}
