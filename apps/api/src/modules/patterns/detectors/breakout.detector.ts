import { clampQuality } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe } from '../patterns.types';
import {
  buildHorizontalGeometry,
  buildSetupId,
  getAtrAndPivots,
  getCurrentVolumeFactor,
  getRecentLevelCandidates,
} from './setup-helpers';

export function detectBreakoutSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 60) return [];

  const structure = getAtrAndPivots(candles, 1.35);
  if (!structure) return [];
  const { atr, pivots } = structure;

  const current = candles[candles.length - 1]!;
  const previous = candles[candles.length - 2]!;
  const tolerance = atr * 0.18;
  const levelTolerance = atr * 0.35;
  const volumeFactor = getCurrentVolumeFactor(candles);
  const recent = candles.slice(-6);
  const recentRange = Math.max(...recent.map(candle => candle.high)) - Math.min(...recent.map(candle => candle.low));
  const candidates: PatternCandidate[] = [];

  for (const level of getRecentLevelCandidates(pivots, 'high', levelTolerance, 3)) {
    const nearResistance = current.close <= level.level + tolerance && current.close >= level.level - atr * 0.35;
    const compressed = recentRange <= atr * 3.2;
    if (level.touches >= 4 && nearResistance && compressed && current.close <= level.level + tolerance) {
      candidates.push({
        id: buildSetupId(symbol, timeframe, 'breakout', level.pivot.time, current.time, level.level + 0.00000001),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'breakout',
        status: 'forming',
        quality: clampQuality(
          66 +
            Math.min(16, level.touches * 4) +
            Math.min(10, Math.round(volumeFactor * 3)) +
            Math.max(0, Math.round(((atr * 0.4 - Math.abs(level.level - current.close)) / (atr * 0.4)) * 10)),
        ),
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

    if (previous.close > level.level + tolerance) continue;
    if (current.close <= level.level + tolerance) continue;
    if (current.close - level.level > atr * 2.8) continue;

    const fromTime = level.pivot.time;
    const toTime = current.time;
    const quality = clampQuality(
      60 +
        Math.min(14, level.touches * 5) +
        Math.min(10, Math.round(volumeFactor * 4)) +
        Math.min(8, Math.round(((current.close - level.level) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'breakout', fromTime, toTime, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'breakout',
      status: 'confirmed',
      quality,
      from: fromTime,
      to: toTime,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime,
        toTime,
        level: level.level,
        atr,
        points: [
          { time: level.pivot.time, price: level.level },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  for (const level of getRecentLevelCandidates(pivots, 'low', levelTolerance, 3)) {
    const nearSupport = current.close >= level.level - tolerance && current.close <= level.level + atr * 0.35;
    const compressed = recentRange <= atr * 3.2;
    if (level.touches >= 4 && nearSupport && compressed && current.close >= level.level - tolerance) {
      candidates.push({
        id: buildSetupId(symbol, timeframe, 'breakout', level.pivot.time, current.time, level.level - 0.00000001),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'breakout',
        status: 'forming',
        quality: clampQuality(
          66 +
            Math.min(16, level.touches * 4) +
            Math.min(10, Math.round(volumeFactor * 3)) +
            Math.max(0, Math.round(((atr * 0.4 - Math.abs(level.level - current.close)) / (atr * 0.4)) * 10)),
        ),
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

    if (previous.close < level.level - tolerance) continue;
    if (current.close >= level.level - tolerance) continue;
    if (level.level - current.close > atr * 2.8) continue;

    const fromTime = level.pivot.time;
    const toTime = current.time;
    const quality = clampQuality(
      60 +
        Math.min(14, level.touches * 5) +
        Math.min(10, Math.round(volumeFactor * 4)) +
        Math.min(8, Math.round(((level.level - current.close) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'breakout', fromTime, toTime, level.level),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'breakout',
      status: 'confirmed',
      quality,
      from: fromTime,
      to: toTime,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime,
        toTime,
        level: level.level,
        atr,
        points: [
          { time: level.pivot.time, price: level.level },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  return candidates
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'forming' ? -1 : 1;
      return b.quality - a.quality;
    })
    .slice(0, 1);
}
