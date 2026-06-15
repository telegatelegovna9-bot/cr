import type { PatternTimeframe } from '../patterns.types';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';

const TIMEFRAME_TO_MS: Record<PatternTimeframe, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

// Formations persist across many bars — much looser freshness
const FORMATION_FRESHNESS: Record<PatternCandidate['kind'], number> = {
  breakout: 1,
  retest: 2,
  structure_break: 1,
  liquidity_sweep: 1,
  triangle: 40,
  wedge: 35,
  flag: 20,
  cascade: 25,
  fvg: 25,
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
  if (!line) {
    // For FVG and other zone-only patterns, use zone midpoint
    const zone = candidate.geometry.zones[0];
    if (!zone) return null;
    return (zone.high + zone.low) / 2;
  }
  return line.points[0]?.price ?? null;
}

function getZoneSpan(candidate: PatternCandidate, fallback: number): number {
  const zone = candidate.geometry.zones[0];
  if (!zone) return fallback;
  return Math.max(Math.abs(zone.high - zone.low), fallback);
}

const FORMATION_KINDS = new Set(['triangle', 'wedge', 'flag', 'cascade', 'fvg']);

export function refinePatternActionability(
  candidate: PatternCandidate,
  candles: DetectorCandle[],
  timeframe: PatternTimeframe,
): ActionabilityResult {
  const current = candles[candles.length - 1];
  if (!current) return { keep: false, quality: candidate.quality };

  const isFormation = FORMATION_KINDS.has(candidate.kind);

  // For formations: check if price is still inside the pattern bounds
  if (isFormation) {
    const priceMin = candidate.geometry.priceMin;
    const priceMax = candidate.geometry.priceMax;
    const priceRange = priceMax - priceMin;

    // Allow 15% outside bounds before dropping
    if (current.close < priceMin - priceRange * 0.15 || current.close > priceMax + priceRange * 0.15) {
      return { keep: false, quality: candidate.quality };
    }

    const barsSinceDetected = candles.length - 1 - findBarIndexByTime(candles, candidate.geometry.anchorTimeTo);
    const freshnessLimit = FORMATION_FRESHNESS[candidate.kind] ?? 10;

    if (barsSinceDetected > freshnessLimit) {
      return { keep: false, quality: candidate.quality };
    }

    // Slight quality bonus for forming patterns near the apex/breakout
    const spanBonus = Math.min(5, Math.round(
      (candidate.geometry.anchorTimeTo - candidate.geometry.anchorTimeFrom) /
      (TIMEFRAME_TO_MS[timeframe] * 10),
    ));

    return {
      keep: true,
      quality: clampQuality(candidate.quality + spanBonus),
    };
  }

  // --- Original logic for event-based patterns (breakout, retest, sweep, etc.) ---

  const level = getPrimaryLevel(candidate);
  if (level == null) return { keep: false, quality: candidate.quality };

  const barsSinceEvent = candles.length - 1 - findBarIndexByTime(candles, candidate.geometry.anchorTimeTo);
  const localRange = Math.max(candidate.geometry.priceMax - candidate.geometry.priceMin, level * 0.0025);
  const zoneSpan = getZoneSpan(candidate, localRange * 0.35);
  const structureRange = Math.max(zoneSpan, Math.min(localRange * 0.45, level * 0.0045));
  const distance = Math.abs(current.close - level);

  const freshnessLimit = FORMATION_FRESHNESS[candidate.kind] ?? 1;
  if (barsSinceEvent > freshnessLimit) {
    return { keep: false, quality: candidate.quality };
  }

  if (distance > structureRange * (candidate.status === 'forming' ? 0.95 : 0.7)) {
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
