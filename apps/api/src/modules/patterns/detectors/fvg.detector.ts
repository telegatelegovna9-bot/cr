import { clampQuality, computeATR } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe, PatternGeometry } from '../patterns.types';
import { buildSetupId } from './setup-helpers';

export function detectFvgSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 15) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const current = candles[candles.length - 1]!;
  const candidates: PatternCandidate[] = [];

  // Scan last 25 candles for unmitigated FVGs
  const scanLimit = Math.min(candles.length - 2, 25);

  for (let offset = 1; offset <= scanLimit; offset++) {
    const idx = candles.length - 1 - offset;
    if (idx < 1) break;

    const prev = candles[idx - 1]!;
    const mid = candles[idx]!;
    const next = candles[idx + 1]!;

    // Bullish FVG: gap between prev.high and next.low (mid candle body spans the gap)
    if (prev.high < next.low && mid.close > mid.open) {
      const gapTop = next.low;
      const gapBot = prev.high;
      const gapSize = gapTop - gapBot;

      if (gapSize < atr * 0.25) continue; // gap too small

      // Check if FVG has been mitigated (price returned into the gap)
      const candles_after = candles.slice(idx + 2);
      const isMitigated = candles_after.some(c => c.low <= gapTop + gapSize * 0.1);
      if (isMitigated) continue;

      // How far is current price from the FVG
      const distToFvg = Math.max(0, current.close - gapTop);
      if (distToFvg > atr * 4) continue; // too far away

      const ageBars = offset;
      const freshness = Math.max(0, 1 - ageBars / 20);
      const gapStrength = Math.min(20, Math.round(gapSize / atr * 10));
      const proximityBonus = distToFvg < atr ? 12 : distToFvg < atr * 2 ? 6 : 0;
      const quality = clampQuality(62 + gapStrength + proximityBonus + Math.round(freshness * 8));

      const status = distToFvg < atr * 0.5 ? 'confirmed' : 'forming';

      const extendedToTime = current.time + (current.time - mid.time) * 0.3;

      const geometry: PatternGeometry = {
        anchorTimeFrom: prev.time,
        anchorTimeTo: extendedToTime,
        priceMin: gapBot - atr * 0.3,
        priceMax: current.high + atr * 0.3,
        pivots: [{ time: mid.time, price: (gapTop + gapBot) / 2 }],
        lines: [],
        zones: [{
          fromTime: mid.time,
          toTime: extendedToTime,
          low: gapBot,
          high: gapTop,
        }],
      };

      candidates.push({
        id: buildSetupId(symbol, timeframe, 'fvg', mid.time, mid.time + 1, (gapTop + gapBot) / 2),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'fvg',
        status,
        quality,
        from: mid.time,
        to: current.time,
        geometry,
      });
    }

    // Bearish FVG: gap between next.high and prev.low
    if (prev.low > next.high && mid.close < mid.open) {
      const gapBot = next.high;
      const gapTop = prev.low;
      const gapSize = gapTop - gapBot;

      if (gapSize < atr * 0.25) continue;

      const candles_after = candles.slice(idx + 2);
      const isMitigated = candles_after.some(c => c.high >= gapBot - gapSize * 0.1);
      if (isMitigated) continue;

      const distToFvg = Math.max(0, gapBot - current.close);
      if (distToFvg > atr * 4) continue;

      const ageBars = offset;
      const freshness = Math.max(0, 1 - ageBars / 20);
      const gapStrength = Math.min(20, Math.round(gapSize / atr * 10));
      const proximityBonus = distToFvg < atr ? 12 : distToFvg < atr * 2 ? 6 : 0;
      const quality = clampQuality(62 + gapStrength + proximityBonus + Math.round(freshness * 8));

      const status = distToFvg < atr * 0.5 ? 'confirmed' : 'forming';

      const extendedToTime = current.time + (current.time - mid.time) * 0.3;

      const geometry: PatternGeometry = {
        anchorTimeFrom: prev.time,
        anchorTimeTo: extendedToTime,
        priceMin: current.low - atr * 0.3,
        priceMax: gapTop + atr * 0.3,
        pivots: [{ time: mid.time, price: (gapTop + gapBot) / 2 }],
        lines: [],
        zones: [{
          fromTime: mid.time,
          toTime: extendedToTime,
          low: gapBot,
          high: gapTop,
        }],
      };

      candidates.push({
        id: buildSetupId(symbol, timeframe, 'fvg', mid.time, mid.time + 2, (gapTop + gapBot) / 2),
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        timeframe,
        kind: 'fvg',
        status,
        quality,
        from: mid.time,
        to: current.time,
        geometry,
      });
    }

    if (candidates.length >= 2) break; // max 2 FVGs per scan
  }

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, 2);
}
