import { randomUUID } from 'node:crypto';
import type { Candle, Timeframe, ExchangeId } from '@crypto-screener/shared';
import { 
  extractStructuralPivots, 
  computeATR, 
  calculateLinearRegression, 
  projectPriceAtTime,
  type SwingPivot 
} from './detector.utils';
import type { PatternCandidate } from './detector.types';

export function detectStructuralPatterns(
  symbol: string,
  exchange: ExchangeId,
  timeframe: Timeframe,
  candles: Candle[],
): PatternCandidate[] {
  if (candles.length < 50) return [];
  
  const atr = computeATR(candles);
  if (atr <= 0) return [];

  // 1. Extract structural pivots (ZigZag)
  // 1.5 ATR is a good balance between structural significance and sensitivity
  const pivots = extractStructuralPivots(candles, 1.5);
  if (pivots.length < 4) return [];

  const candidates: PatternCandidate[] = [];

  // 2. Run specialized detectors
  candidates.push(...detectTrianglesAndWedges(symbol, exchange, timeframe, candles, pivots, atr));
  candidates.push(...detectTrendChannels(symbol, exchange, timeframe, candles, pivots, atr));

  return candidates;
}

function detectTrianglesAndWedges(
  symbol: string,
  exchange: ExchangeId,
  timeframe: Timeframe,
  candles: Candle[],
  pivots: SwingPivot[],
  atr: number,
): PatternCandidate[] {
  const results: PatternCandidate[] = [];
  const highs = pivots.filter(p => p.kind === 'high');
  const lows = pivots.filter(p => p.kind === 'low');

  if (highs.length < 2 || lows.length < 2) return [];

  const highReg = calculateLinearRegression(highs.map(p => ({ x: p.candleIndex, y: p.price })));
  const lowReg = calculateLinearRegression(lows.map(p => ({ x: p.candleIndex, y: p.price })));

  // Slope threshold: a line is "flat" if its total change is less than 0.5 ATR over the average pivot distance
  const flatThreshold = (atr * 0.5) / 20; // roughly 0.5 ATR over 20 candles

  const isConverging = highReg.slope < -0.00001 && lowReg.slope > 0.00001;
  const isAscending = Math.abs(highReg.slope) < flatThreshold && lowReg.slope > 0.00001;
  const isDescending = highReg.slope < -0.00001 && Math.abs(lowReg.slope) < flatThreshold;

  // Use a slightly lower R2 threshold but penalize 2-point lines
  const minR2 = 0.75;
  if ((isConverging || isAscending || isDescending) && highReg.r2 >= minR2 && lowReg.r2 >= minR2) {
    const kind = isConverging ? 'triangle_symmetrical' : isAscending ? 'triangle_ascending' : 'triangle_descending';
    
    // Quality penalty for only 2 points (perfect R2 but low structural proof)
    let quality = highReg.r2 * lowReg.r2 * 100;
    if (highs.length === 2) quality *= 0.85;
    if (lows.length === 2) quality *= 0.85;
    
    results.push(createCandidate(
      symbol, exchange, timeframe, kind,
      highs[0], highs[highs.length - 1],
      lows[0], lows[lows.length - 1],
      pivots, quality,
      candles
    ));
  }

  return results;
}

function detectTrendChannels(
  symbol: string,
  exchange: ExchangeId,
  timeframe: Timeframe,
  candles: Candle[],
  pivots: SwingPivot[],
  atr: number,
): PatternCandidate[] {
  const results: PatternCandidate[] = [];
  const highs = pivots.filter(p => p.kind === 'high');
  const lows = pivots.filter(p => p.kind === 'low');

  if (highs.length < 2 || lows.length < 2) return [];

  const highReg = calculateLinearRegression(highs.map(p => ({ x: p.candleIndex, y: p.price })));
  const lowReg = calculateLinearRegression(lows.map(p => ({ x: p.candleIndex, y: p.price })));

  // Channels have similar slopes
  const slopeDiff = Math.abs(highReg.slope - lowReg.slope);
  const avgSlope = (Math.abs(highReg.slope) + Math.abs(lowReg.slope)) / 2;

  // Both lines must be trending in the same direction and be fairly parallel
  const sameDirection = (highReg.slope > 0 && lowReg.slope > 0) || (highReg.slope < 0 && lowReg.slope < 0);

  if (sameDirection && (slopeDiff / Math.abs(avgSlope) < 0.3) && highReg.r2 > 0.75 && lowReg.r2 > 0.75) {
    const kind = highReg.slope > 0 ? 'channel_up' : 'channel_down';
    
    let quality = highReg.r2 * lowReg.r2 * 100;
    if (highs.length === 2) quality *= 0.9;
    if (lows.length === 2) quality *= 0.9;

    results.push(createCandidate(
      symbol, exchange, timeframe, kind,
      highs[0], highs[highs.length - 1],
      lows[0], lows[lows.length - 1],
      pivots, quality,
      candles
    ));
  }

  return results;
}

function createCandidate(
  symbol: string,
  exchange: ExchangeId,
  timeframe: Timeframe,
  kind: string,
  h1: SwingPivot, h2: SwingPivot,
  l1: SwingPivot, l2: SwingPivot,
  allPivots: SwingPivot[],
  quality: number,
  candles: Candle[]
): PatternCandidate {
  const lastCandle = candles[candles.length - 1];
  const startTime = Math.min(h1.time, l1.time);
  const endTime = Math.max(h2.time, l2.time);
  
  // Project lines into the future (ray)
  const rayTime = lastCandle.time + (endTime - startTime) * 0.4;
  const rayHighPrice = projectPriceAtTime(h1.time, h1.price, h2.time, h2.price, rayTime);
  const rayLowPrice = projectPriceAtTime(l1.time, l1.price, l2.time, l2.price, rayTime);

  return {
    id: randomUUID(),
    exchange: 'binance',
    marketType: 'futures',
    symbol,
    timeframe: timeframe as any,
    kind: kind as any,
    status: 'forming',
    quality: Math.max(0, Math.min(100, Math.round(quality))),
    from: startTime,
    to: endTime,
    geometry: {
      anchorTimeFrom: startTime,
      anchorTimeTo: endTime,
      priceMin: Math.min(...candles.map(c => c.low)),
      priceMax: Math.max(...candles.map(c => c.high)),
      pivots: allPivots.filter(p => p.time >= startTime).map(p => ({ time: p.time, price: p.price })),
      lines: [
        {
          kind: 'ray',
          points: [
            { time: h1.time, price: h1.price },
            { time: rayTime, price: rayHighPrice }
          ]
        },
        {
          kind: 'ray',
          points: [
            { time: l1.time, price: l1.price },
            { time: rayTime, price: rayLowPrice }
          ]
        }
      ],
      zones: []
    }
  };
}
