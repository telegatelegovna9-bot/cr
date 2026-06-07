import { clampQuality } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe } from '../patterns.types';
import {
  buildHorizontalGeometry,
  buildSetupId,
  getAtrAndPivots,
  getCurrentVolumeFactor,
  getRecentLevelCandidates,
  getSetupTimeframeConfig,
} from './setup-helpers';

export function detectRetestSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 70) return [];

  const config = getSetupTimeframeConfig(timeframe);
  const structure = getAtrAndPivots(candles, config.pivotMultiplier);
  if (!structure) return [];
  const { atr, pivots } = structure;

  const current = candles[candles.length - 1]!;
  const recent = candles.slice(-Math.max(8, config.compressionBars + 2));
  const tolerance = atr * 0.18;
  const levelTolerance = atr * 0.35;
  const volumeFactor = getCurrentVolumeFactor(candles);
  const candidates: PatternCandidate[] = [];

  for (const level of getRecentLevelCandidates(pivots, 'high', levelTolerance, 3, config.levelLookbackPivots)) {
    const levelAgeBars = candles.length - 1 - level.pivot.candleIndex;
    if (level.touches < config.minTouches || levelAgeBars < config.minLevelAgeBars) continue;

    const breakoutCandle = recent.find(candle => candle.close > level.level + tolerance);
    if (!breakoutCandle) continue;

    const retestCandle = recent.find(
      candle =>
        candle.time > breakoutCandle.time &&
        candle.low <= level.level + tolerance &&
        candle.close >= level.level,
    );
    if (!retestCandle) continue;
    if (current.close < level.level - tolerance) continue;
    if (current.close - level.level > atr * config.breakoutTravelAtr) continue;
    if (volumeFactor < config.minVolumeFactor) continue;

    const quality = clampQuality(
      62 +
        Math.min(12, level.touches * 4) +
        Math.min(10, Math.round(volumeFactor * 4)) +
        Math.min(8, Math.round(((current.close - level.level) / atr) * 3)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'retest', level.pivot.time, retestCandle.time, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'retest',
      status: 'confirmed',
      quality,
      from: level.pivot.time,
      to: retestCandle.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: level.pivot.time,
        toTime: retestCandle.time,
        level: level.level,
        atr,
        points: [
          { time: breakoutCandle.time, price: breakoutCandle.close },
          { time: retestCandle.time, price: retestCandle.close },
        ],
      }),
    });
  }

  for (const level of getRecentLevelCandidates(pivots, 'low', levelTolerance, 3, config.levelLookbackPivots)) {
    const levelAgeBars = candles.length - 1 - level.pivot.candleIndex;
    if (level.touches < config.minTouches || levelAgeBars < config.minLevelAgeBars) continue;

    const breakoutCandle = recent.find(candle => candle.close < level.level - tolerance);
    if (!breakoutCandle) continue;

    const retestCandle = recent.find(
      candle =>
        candle.time > breakoutCandle.time &&
        candle.high >= level.level - tolerance &&
        candle.close <= level.level,
    );
    if (!retestCandle) continue;
    if (current.close > level.level + tolerance) continue;
    if (level.level - current.close > atr * config.breakoutTravelAtr) continue;
    if (volumeFactor < config.minVolumeFactor) continue;

    const quality = clampQuality(
      62 +
        Math.min(12, level.touches * 4) +
        Math.min(10, Math.round(volumeFactor * 4)) +
        Math.min(8, Math.round(((level.level - current.close) / atr) * 3)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'retest', level.pivot.time, retestCandle.time, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'retest',
      status: 'confirmed',
      quality,
      from: level.pivot.time,
      to: retestCandle.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: level.pivot.time,
        toTime: retestCandle.time,
        level: level.level,
        atr,
        points: [
          { time: breakoutCandle.time, price: breakoutCandle.close },
          { time: retestCandle.time, price: retestCandle.close },
        ],
      }),
    });
  }

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, 2);
}
