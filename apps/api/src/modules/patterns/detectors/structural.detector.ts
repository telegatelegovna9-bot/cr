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

  const pivots = extractStructuralPivots(candles, 1.5);
  if (pivots.length < 4) return [];

  const candidates: PatternCandidate[] = [];
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

  // NORMALIZE: A line is "significant" if its total vertical move is at least 0.5 ATR
  // Normalized slope = slope / atr
  const normHighSlope = highReg.slope / atr;
  const normLowSlope = lowReg.slope / atr;
  
  // A slope is considered "flat" if it moves less than 0.05 ATR per candle
  const flatThreshold = 0.05;

  const isConverging = normHighSlope < -flatThreshold && normLowSlope > flatThreshold;
  const isAscending = Math.abs(normHighSlope) < flatThreshold && normLowSlope > flatThreshold;
  const isDescending = normHighSlope < -flatThreshold && Math.abs(normLowSlope) < flatThreshold;

  const minR2 = 0.70; // Slightly lower for crypto noise
  if ((isConverging || isAscending || isDescending) && highReg.r2 >= minR2 && lowReg.r2 >= minR2) {
    const kind = isConverging ? 'triangle_symmetrical' : isAscending ? 'triangle_ascending' : 'triangle_descending';
    
    let quality = ((highReg.r2 + lowReg.r2) / 2) * 100;
    // Reward more touches
    if (highs.length > 2) quality += 5;
    if (lows.length > 2) quality += 5;
    // Penalty for minimal points
    if (highs.length === 2 && lows.length === 2) quality -= 10;
    
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

  const normHighSlope = highReg.slope / atr;
  const normLowSlope = lowReg.slope / atr;

  // Channels have similar slopes and must be trending
  const slopeDiff = Math.abs(normHighSlope - normLowSlope);
  const trending = Math.abs(normHighSlope) > 0.05 && Math.abs(normLowSlope) > 0.05;
  const sameDirection = (normHighSlope > 0 && normLowSlope > 0) || (normHighSlope < 0 && normLowSlope < 0);

  if (trending && sameDirection && slopeDiff < 0.15 && highReg.r2 > 0.70 && lowReg.r2 > 0.70) {
    const kind = highReg.slope > 0 ? 'channel_up' : 'channel_down';
    
    let quality = ((highReg.r2 + lowReg.r2) / 2) * 100;
    if (highs.length > 2 || lows.length > 2) quality += 10;

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
