import { clampQuality, computeATR, extractStructuralPivots } from './detector.utils';
import type { PatternCandidate, DetectorCandle } from './detector.types';
import type { PatternTimeframe, PatternGeometry } from '../patterns.types';
import { buildSetupId } from './setup-helpers';

export function detectCascadeSetups(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 60) return [];

  const atr = computeATR(candles);
  if (atr <= 0) return [];

  const pivotMult = timeframe === '1d' ? 1.2 : timeframe === '4h' ? 1.3 : 1.5;
  const pivots = extractStructuralPivots(candles, pivotMult);

  if (pivots.length < 6) return [];

  const current = candles[candles.length - 1]!;

  // Try bullish cascade (higher highs + higher lows)
  const bullishCascade = detectDirectionalCascade(pivots, 'bullish', atr);
  // Try bearish cascade (lower highs + lower lows)
  const bearishCascade = detectDirectionalCascade(pivots, 'bearish', atr);

  const candidates: PatternCandidate[] = [];

  for (const cascade of [bullishCascade, bearishCascade]) {
    if (!cascade || cascade.steps < 3) continue;

    // Price must still be in the cascade (not broken the last step)
    if (cascade.isBullish) {
      if (current.close < cascade.lastLow - atr * 0.5) continue; // cascade invalidated
    } else {
      if (current.close > cascade.lastHigh + atr * 0.5) continue;
    }

    // Build step zones for the last 3 steps
    const fromTime = cascade.steps >= 4 ? cascade.stepsData[cascade.stepsData.length - 4]?.time ?? cascade.fromTime : cascade.fromTime;
    const toTime = current.time;

    const pivotPoints = cascade.keyPivots.map(p => ({ time: p.time, price: p.price }));

    // Support/resistance lines from last step
    const lastStepLevel = cascade.isBullish ? cascade.lastLow : cascade.lastHigh;
    const prevStepLevel = cascade.isBullish ? cascade.prevLow : cascade.prevHigh;

    const geometry: PatternGeometry = {
      anchorTimeFrom: fromTime,
      anchorTimeTo: current.time + (current.time - fromTime) * 0.15,
      priceMin: (cascade.isBullish ? cascade.lastLow : cascade.lastHigh) - atr * 1.5,
      priceMax: (cascade.isBullish ? cascade.lastHigh : cascade.lastLow) + atr * 1.5,
      pivots: pivotPoints.slice(-6),
      lines: [
        // Current step S/R level
        {
          kind: 'ray',
          points: [
            { time: cascade.lastStepStart, price: lastStepLevel },
            { time: current.time + (current.time - fromTime) * 0.15, price: lastStepLevel },
          ] as [{ time: number; price: number }, { time: number; price: number }],
        },
        // Previous step level (shows step structure)
        {
          kind: 'segment',
          points: [
            { time: fromTime, price: prevStepLevel },
            { time: cascade.lastStepStart, price: prevStepLevel },
          ] as [{ time: number; price: number }, { time: number; price: number }],
        },
      ],
      zones: [
        // Current step consolidation zone
        {
          fromTime: cascade.lastStepStart,
          toTime: current.time,
          low: cascade.isBullish ? cascade.lastLow - atr * 0.2 : cascade.lastHigh,
          high: cascade.isBullish ? cascade.lastHigh : cascade.lastHigh + atr * 0.2,
        },
      ],
    };

    const stepBonus = Math.min(20, (cascade.steps - 3) * 6);
    const sizeConsistency = Math.min(15, Math.round(cascade.consistencyScore * 15));
    const quality = clampQuality(65 + stepBonus + sizeConsistency);

    candidates.push({
      id: buildSetupId(symbol, timeframe, 'cascade', cascade.fromTime, cascade.lastStepStart, lastStepLevel),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'cascade',
      status: 'forming',
      quality,
      from: cascade.fromTime,
      to: current.time,
      geometry,
    });
  }

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, 1);
}

interface CascadeResult {
  isBullish: boolean;
  steps: number;
  fromTime: number;
  lastStepStart: number;
  lastHigh: number;
  lastLow: number;
  prevHigh: number;
  prevLow: number;
  keyPivots: Array<{ time: number; price: number }>;
  stepsData: Array<{ time: number; price: number }>;
  consistencyScore: number;
}

function detectDirectionalCascade(
  pivots: ReturnType<typeof extractStructuralPivots>,
  direction: 'bullish' | 'bearish',
  atr: number,
): CascadeResult | null {
  const isBullish = direction === 'bullish';
  const recentPivots = pivots.slice(-12);

  // Build alternating H/L sequence
  const highs = recentPivots.filter(p => p.kind === 'high');
  const lows = recentPivots.filter(p => p.kind === 'low');

  if (highs.length < 3 || lows.length < 3) return null;

  // Check for consistent higher highs + higher lows (bullish) or lower highs + lower lows (bearish)
  let validSteps = 0;
  const stepSizes: number[] = [];
  const keyPivots: Array<{ time: number; price: number }> = [];
  const stepsData: Array<{ time: number; price: number }> = [];

  const mainPivots = isBullish ? lows : highs;
  const counterPivots = isBullish ? highs : lows;

  for (let i = 1; i < mainPivots.length; i++) {
    const prev = mainPivots[i - 1]!;
    const curr = mainPivots[i]!;

    const isProgressing = isBullish
      ? curr.price > prev.price + atr * 0.2 // each low higher than previous
      : curr.price < prev.price - atr * 0.2; // each high lower than previous

    if (!isProgressing) break;

    // Find the counter pivot between these two main pivots
    const betweenCounter = counterPivots.find(
      p => p.time > prev.time && p.time < curr.time,
    );

    if (betweenCounter) {
      const stepSize = Math.abs(betweenCounter.price - prev.price);
      stepSizes.push(stepSize);
      keyPivots.push({ time: prev.time, price: prev.price });
      keyPivots.push({ time: betweenCounter.time, price: betweenCounter.price });
      stepsData.push({ time: curr.time, price: curr.price });
    }

    validSteps++;
  }

  if (validSteps < 3) return null;

  // Check step size consistency (all steps roughly equal)
  if (stepSizes.length < 2) return null;
  const avgSize = stepSizes.reduce((a, b) => a + b, 0) / stepSizes.length;
  const maxDeviation = Math.max(...stepSizes.map(s => Math.abs(s - avgSize) / avgSize));
  const consistencyScore = Math.max(0, 1 - maxDeviation);

  const lastMain = mainPivots[mainPivots.length - 1]!;
  const prevMain = mainPivots[mainPivots.length - 2]!;
  const lastCounter = counterPivots[counterPivots.length - 1]!;
  const prevCounter = counterPivots[counterPivots.length - 2] ?? lastCounter;

  return {
    isBullish,
    steps: validSteps,
    fromTime: mainPivots[0]!.time,
    lastStepStart: isBullish ? lastMain.time : lastMain.time,
    lastHigh: isBullish ? lastCounter.price : lastMain.price,
    lastLow: isBullish ? lastMain.price : lastCounter.price,
    prevHigh: isBullish ? prevCounter.price : prevMain.price,
    prevLow: isBullish ? prevMain.price : prevCounter.price,
    keyPivots,
    stepsData,
    consistencyScore,
  };
}
