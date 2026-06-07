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

export function detectLiquiditySweepSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 60) return [];

  const config = getSetupTimeframeConfig(timeframe);
  const structure = getAtrAndPivots(candles, config.pivotMultiplier);
  if (!structure) return [];
  const { atr, pivots } = structure;

  const current = candles[candles.length - 1]!;
  const levelTolerance = atr * 0.35;
  const sweepTolerance = atr * 0.12;
  const volumeFactor = getCurrentVolumeFactor(candles);
  const candidates: PatternCandidate[] = [];

  for (const level of getRecentLevelCandidates(pivots, 'high', levelTolerance, 2, config.levelLookbackPivots)) {
    const levelAgeBars = candles.length - 1 - level.pivot.candleIndex;
    if (level.touches < config.minTouches || levelAgeBars < config.minLevelAgeBars) continue;
    if (current.high <= level.level + sweepTolerance) continue;
    if (current.close >= level.level) continue;
    if (volumeFactor < config.minVolumeFactor) continue;

    const quality = clampQuality(
      66 +
        Math.min(10, level.touches * 4) +
        Math.min(12, Math.round(volumeFactor * 5)) +
        Math.min(8, Math.round(((current.high - level.level) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'liquidity_sweep', level.pivot.time, current.time, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'liquidity_sweep',
      status: 'confirmed',
      quality,
      from: level.pivot.time,
      to: current.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: level.pivot.time,
        toTime: current.time,
        level: level.level,
        atr,
        points: [
          { time: level.pivot.time, price: level.level },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  for (const level of getRecentLevelCandidates(pivots, 'low', levelTolerance, 2, config.levelLookbackPivots)) {
    const levelAgeBars = candles.length - 1 - level.pivot.candleIndex;
    if (level.touches < config.minTouches || levelAgeBars < config.minLevelAgeBars) continue;
    if (current.low >= level.level - sweepTolerance) continue;
    if (current.close <= level.level) continue;
    if (volumeFactor < config.minVolumeFactor) continue;

    const quality = clampQuality(
      66 +
        Math.min(10, level.touches * 4) +
        Math.min(12, Math.round(volumeFactor * 5)) +
        Math.min(8, Math.round(((level.level - current.low) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'liquidity_sweep', level.pivot.time, current.time, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'liquidity_sweep',
      status: 'confirmed',
      quality,
      from: level.pivot.time,
      to: current.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: level.pivot.time,
        toTime: current.time,
        level: level.level,
        atr,
        points: [
          { time: level.pivot.time, price: level.level },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, 2);
}
