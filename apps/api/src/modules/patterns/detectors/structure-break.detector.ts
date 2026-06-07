import { clampQuality } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe } from '../patterns.types';
import {
  buildHorizontalGeometry,
  buildSetupId,
  getAtrAndPivots,
  getCurrentVolumeFactor,
  getSetupTimeframeConfig,
} from './setup-helpers';

export function detectStructureBreakSetups(
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
  const previous = candles[candles.length - 2]!;
  const tolerance = atr * 0.15;
  const volumeFactor = getCurrentVolumeFactor(candles);
  const candidates: PatternCandidate[] = [];

  const lastHigh = [...pivots].reverse().find(pivot => pivot.kind === 'high');
  const lastLow = [...pivots].reverse().find(pivot => pivot.kind === 'low');

  if (
    lastHigh &&
    candles.length - 1 - lastHigh.candleIndex >= config.minLevelAgeBars &&
    volumeFactor >= config.minVolumeFactor &&
    previous.close <= lastHigh.price + tolerance &&
    current.close > lastHigh.price + tolerance &&
    current.close - lastHigh.price <= atr * config.breakoutTravelAtr
  ) {
    const quality = clampQuality(
      64 +
        Math.min(12, Math.round(volumeFactor * 4)) +
        Math.min(10, Math.round(((current.close - lastHigh.price) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'structure_break', lastHigh.time, current.time, lastHigh.price),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'structure_break',
      status: 'confirmed',
      quality,
      from: lastHigh.time,
      to: current.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: lastHigh.time,
        toTime: current.time,
        level: lastHigh.price,
        atr,
        points: [
          { time: lastHigh.time, price: lastHigh.price },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  if (
    lastLow &&
    candles.length - 1 - lastLow.candleIndex >= config.minLevelAgeBars &&
    volumeFactor >= config.minVolumeFactor &&
    previous.close >= lastLow.price - tolerance &&
    current.close < lastLow.price - tolerance &&
    lastLow.price - current.close <= atr * config.breakoutTravelAtr
  ) {
    const quality = clampQuality(
      64 +
        Math.min(12, Math.round(volumeFactor * 4)) +
        Math.min(10, Math.round(((lastLow.price - current.close) / atr) * 4)),
    );

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'structure_break', lastLow.time, current.time, lastLow.price),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'structure_break',
      status: 'confirmed',
      quality,
      from: lastLow.time,
      to: current.time,
      geometry: buildHorizontalGeometry({
        candles,
        fromTime: lastLow.time,
        toTime: current.time,
        level: lastLow.price,
        atr,
        points: [
          { time: lastLow.time, price: lastLow.price },
          { time: current.time, price: current.close },
        ],
      }),
    });
  }

  return candidates;
}
