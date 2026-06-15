import { clampQuality, computeATR } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe, PatternGeometry } from '../patterns.types';
import { buildSetupId, getAverageVolume } from './setup-helpers';

export function detectFlagSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 30) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const avgVol = getAverageVolume(candles, 20);
  const current = candles[candles.length - 1]!;
  const candidates: PatternCandidate[] = [];

  // Scan for impulse pole: sharp move >= 2.5 ATR in 3-10 bars
  for (let poleEnd = candles.length - 5; poleEnd >= 10; poleEnd -= 1) {
    let foundPole = false;
    let poleStart = -1;
    let poleBullish = false;

    for (let poleLen = 3; poleLen <= 10; poleLen++) {
      const startIdx = poleEnd - poleLen;
      if (startIdx < 0) break;

      const poleStartCandle = candles[startIdx]!;
      const poleEndCandle = candles[poleEnd]!;
      const move = poleEndCandle.close - poleStartCandle.close;

      if (Math.abs(move) < atr * 2.5) continue;

      // Pole must have good body ratio (strong move, not wicks)
      const poleRange = Math.abs(poleEndCandle.high - poleStartCandle.low);
      const poleBody = Math.abs(move);
      if (poleBody / poleRange < 0.5) continue;

      foundPole = true;
      poleStart = startIdx;
      poleBullish = move > 0;
      break;
    }

    if (!foundPole) continue;

    // Flag body: the candles AFTER the pole
    const flagCandles = candles.slice(poleEnd + 1);
    if (flagCandles.length < 3) continue;

    const flagLen = Math.min(flagCandles.length, 15);
    const flagSlice = flagCandles.slice(0, flagLen);

    const flagHigh = Math.max(...flagSlice.map(c => c.high));
    const flagLow = Math.min(...flagSlice.map(c => c.low));
    const flagRange = flagHigh - flagLow;

    // Flag should be a tight consolidation — max 60% of pole
    const poleStartCandle = candles[poleStart]!;
    const poleEndCandle = candles[poleEnd]!;
    const poleSize = Math.abs(poleEndCandle.close - poleStartCandle.close);
    if (flagRange > poleSize * 0.6) continue;
    if (flagRange < atr * 0.3) continue; // too tight — likely not forming

    // Flag should retrace counter to pole direction
    const flagMid = (flagHigh + flagLow) / 2;
    const poleEndClose = poleEndCandle.close;
    if (poleBullish && flagMid >= poleEndClose) continue; // bullish flag should retrace down
    if (!poleBullish && flagMid <= poleEndClose) continue; // bearish flag should retrace up

    // Current price must still be inside the flag
    if (current.close > flagHigh + atr * 0.3 || current.close < flagLow - atr * 0.3) continue;

    // Volume: flag should have lower volume than pole
    const poleVolAvg = candles.slice(poleStart, poleEnd + 1).reduce((s, c) => s + c.volume, 0) / (poleEnd - poleStart + 1);
    const flagVolAvg = flagSlice.reduce((s, c) => s + c.volume, 0) / flagSlice.length;
    const volumeDecline = poleVolAvg > 0 ? flagVolAvg / poleVolAvg : 1;

    // Breakout target: resume of pole direction from flag
    const breakoutLevel = poleBullish ? flagHigh : flagLow;

    const poleStartTime = poleStartCandle.time;
    const poleEndTime = poleEndCandle.time;
    const flagStartTime = flagSlice[0]!.time;

    const touchCount = Math.min(flagLen, 8);
    const compressionBonus = Math.min(10, Math.round((1 - flagRange / (poleSize || 1)) * 10));
    const volumeBonus = volumeDecline < 0.7 ? 8 : volumeDecline < 0.9 ? 4 : 0;
    const quality = clampQuality(65 + compressionBonus + volumeBonus + Math.min(8, touchCount));

    const status = flagLen >= 5 ? 'confirmed' : 'forming';

    // Breakout projection line
    const projectedTargetTime = current.time + (poleEndTime - poleStartTime);
    const projectedTargetPrice = poleBullish
      ? breakoutLevel + poleSize
      : breakoutLevel - poleSize;

    const pivots = [
      { time: poleStartTime, price: poleStartCandle.close },
      { time: poleEndTime, price: poleEndCandle.close },
      { time: current.time, price: current.close },
    ].sort((a, b) => a.time - b.time);

    const geometry: PatternGeometry = {
      anchorTimeFrom: poleStartTime,
      anchorTimeTo: current.time,
      priceMin: Math.min(poleStartCandle.low, flagLow) - atr * 0.3,
      priceMax: Math.max(poleEndCandle.high, flagHigh) + atr * 0.3,
      pivots,
      lines: [
        // Pole
        {
          kind: 'segment',
          points: [
            { time: poleStartTime, price: poleStartCandle.close },
            { time: poleEndTime, price: poleEndCandle.close },
          ] as [{ time: number; price: number }, { time: number; price: number }],
        },
        // Breakout level (ray)
        {
          kind: 'ray',
          points: [
            { time: flagStartTime, price: breakoutLevel },
            { time: current.time + (poleEndTime - poleStartTime), price: breakoutLevel },
          ] as [{ time: number; price: number }, { time: number; price: number }],
        },
      ],
      zones: [
        // Flag body zone
        {
          fromTime: flagStartTime,
          toTime: current.time,
          low: flagLow,
          high: flagHigh,
        },
      ],
    };

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'flag', poleStartTime, flagStartTime, breakoutLevel),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'flag',
      status,
      quality,
      from: poleStartTime,
      to: current.time,
      geometry,
    });

    break; // one flag per scan
  }

  return candidates;
}
