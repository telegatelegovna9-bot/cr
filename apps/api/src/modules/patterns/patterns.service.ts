import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { DetectedPattern, PatternType, Candle, Timeframe, ExchangeId } from '@crypto-screener/shared';
import { generateId } from '@crypto-screener/shared';

@Injectable()
export class PatternsService {
  private activePatterns: DetectedPattern[] = [];
  private readonly MAX_PATTERNS = 500;

  constructor(private readonly db: DatabaseService) {}

  /**
   * Detect patterns from candle data
   * This implements basic pattern detection - ML-ready architecture
   */
  detectPatterns(
    candles: Candle[],
    symbol: string,
    exchange: ExchangeId,
    timeframe: Timeframe,
  ): DetectedPattern[] {
    if (candles.length < 20) return [];

    const patterns: DetectedPattern[] = [];

    // Support/Resistance levels
    patterns.push(...this.detectSupportResistance(candles, symbol, exchange, timeframe));

    // Trend patterns
    patterns.push(...this.detectTriangles(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectChannels(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectWedges(candles, symbol, exchange, timeframe));

    // ICT/Smart Money patterns
    patterns.push(...this.detectBOS(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectCHOCH(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectFVG(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectOrderBlocks(candles, symbol, exchange, timeframe));
    patterns.push(...this.detectLiquiditySweeps(candles, symbol, exchange, timeframe));

    return patterns.filter(p => p.confidence > 0.5);
  }

  private detectSupportResistance(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const lookback = Math.min(candles.length - 1, 50);
    const recent = candles.slice(-lookback);

    // Find local minima and maxima
    for (let i = 2; i < recent.length - 2; i++) {
      // Local minimum (support)
      if (recent[i].low < recent[i - 1].low &&
          recent[i].low < recent[i - 2].low &&
          recent[i].low < recent[i + 1].low &&
          recent[i].low < recent[i + 2].low) {
        
        // Check if this level has been tested before
        const level = recent[i].low;
        const tests = recent.filter(c => 
          Math.abs(c.low - level) / level < 0.005
        ).length;

        if (tests >= 2) {
          patterns.push({
            id: generateId(),
            symbol,
            exchange,
            type: 'support',
            timeframe,
            confidence: Math.min(0.5 + tests * 0.1, 0.95),
            points: [
              { price: level, timestamp: recent[i].timestamp },
            ],
            description: `Support level at ${level.toFixed(4)} tested ${tests} times`,
            direction: 'bullish',
            detectedAt: Date.now(),
            status: 'confirmed',
          });
        }
      }

      // Local maximum (resistance)
      if (recent[i].high > recent[i - 1].high &&
          recent[i].high > recent[i - 2].high &&
          recent[i].high > recent[i + 1].high &&
          recent[i].high > recent[i + 2].high) {
        
        const level = recent[i].high;
        const tests = recent.filter(c => 
          Math.abs(c.high - level) / level < 0.005
        ).length;

        if (tests >= 2) {
          patterns.push({
            id: generateId(),
            symbol,
            exchange,
            type: 'resistance',
            timeframe,
            confidence: Math.min(0.5 + tests * 0.1, 0.95),
            points: [
              { price: level, timestamp: recent[i].timestamp },
            ],
            description: `Resistance level at ${level.toFixed(4)} tested ${tests} times`,
            direction: 'bearish',
            detectedAt: Date.now(),
            status: 'confirmed',
          });
        }
      }
    }

    return patterns;
  }

  private detectTriangles(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-30);
    if (recent.length < 20) return patterns;

    // Find swing highs and lows
    const highs: { price: number; idx: number }[] = [];
    const lows: { price: number; idx: number }[] = [];

    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high) {
        highs.push({ price: recent[i].high, idx: i });
      }
      if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i + 1].low) {
        lows.push({ price: recent[i].low, idx: i });
      }
    }

    // Ascending triangle: flat highs, higher lows
    if (highs.length >= 2 && lows.length >= 2) {
      const highSlope = (highs[highs.length - 1].price - highs[0].price) / (highs[highs.length - 1].idx - highs[0].idx);
      const lowSlope = (lows[lows.length - 1].price - lows[0].price) / (lows[lows.length - 1].idx - lows[0].idx);

      if (Math.abs(highSlope) < 0.001 && lowSlope > 0) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'triangle_ascending', timeframe,
          confidence: 0.7,
          points: [...highs, ...lows].map(h => ({ price: h.price, timestamp: recent[h.idx].timestamp })),
          description: 'Ascending triangle pattern - bullish continuation',
          direction: 'bullish',
          targetPrice: highs[0].price * 1.02,
          stopLoss: lows[lows.length - 1].price * 0.99,
          detectedAt: Date.now(),
          status: 'forming',
        });
      }

      // Descending triangle: lower highs, flat lows
      if (Math.abs(lowSlope) < 0.001 && highSlope < 0) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'triangle_descending', timeframe,
          confidence: 0.7,
          points: [...highs, ...lows].map(h => ({ price: h.price, timestamp: recent[h.idx].timestamp })),
          description: 'Descending triangle pattern - bearish continuation',
          direction: 'bearish',
          targetPrice: lows[0].price * 0.98,
          stopLoss: highs[highs.length - 1].price * 1.01,
          detectedAt: Date.now(),
          status: 'forming',
        });
      }

      // Symmetrical triangle: converging highs and lows
      if (highSlope < 0 && lowSlope > 0) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'triangle_symmetrical', timeframe,
          confidence: 0.6,
          points: [...highs, ...lows].map(h => ({ price: h.price, timestamp: recent[h.idx].timestamp })),
          description: 'Symmetrical triangle - breakout expected',
          direction: 'neutral',
          detectedAt: Date.now(),
          status: 'forming',
        });
      }
    }

    return patterns;
  }

  private detectChannels(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-40);
    if (recent.length < 20) return patterns;

    // Simple linear regression on highs and lows
    const highs = recent.map((c, i) => ({ x: i, y: c.high }));
    const lows = recent.map((c, i) => ({ x: i, y: c.low }));

    const highReg = this.linearRegression(highs);
    const lowReg = this.linearRegression(lows);

    // Check if slopes are similar (parallel channel)
    if (Math.abs(highReg.slope - lowReg.slope) / Math.abs(highReg.slope) < 0.3) {
      if (highReg.slope > 0.001) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'channel_up', timeframe,
          confidence: 0.65,
          points: [
            { price: highReg.slope * 0 + highReg.intercept, timestamp: recent[0].timestamp },
            { price: highReg.slope * (recent.length - 1) + highReg.intercept, timestamp: recent[recent.length - 1].timestamp },
          ],
          description: 'Upward channel - trend continuation',
          direction: 'bullish',
          detectedAt: Date.now(),
          status: 'forming',
        });
      } else if (highReg.slope < -0.001) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'channel_down', timeframe,
          confidence: 0.65,
          points: [
            { price: highReg.slope * 0 + highReg.intercept, timestamp: recent[0].timestamp },
            { price: highReg.slope * (recent.length - 1) + highReg.intercept, timestamp: recent[recent.length - 1].timestamp },
          ],
          description: 'Downward channel - trend continuation',
          direction: 'bearish',
          detectedAt: Date.now(),
          status: 'forming',
        });
      }
    }

    return patterns;
  }

  private detectWedges(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-30);
    if (recent.length < 15) return patterns;

    const highs = recent.map((c, i) => ({ x: i, y: c.high }));
    const lows = recent.map((c, i) => ({ x: i, y: c.low }));

    const highReg = this.linearRegression(highs);
    const lowReg = this.linearRegression(lows);

    // Rising wedge: both slopes positive, high slope < low slope (converging)
    if (highReg.slope > 0 && lowReg.slope > 0 && highReg.slope < lowReg.slope) {
      patterns.push({
        id: generateId(),
        symbol, exchange, type: 'wedge_rising', timeframe,
        confidence: 0.65,
        points: [
          { price: recent[0].high, timestamp: recent[0].timestamp },
          { price: recent[recent.length - 1].high, timestamp: recent[recent.length - 1].timestamp },
        ],
        description: 'Rising wedge - bearish reversal expected',
        direction: 'bearish',
        detectedAt: Date.now(),
        status: 'forming',
      });
    }

    // Falling wedge: both slopes negative, |high slope| > |low slope| (converging)
    if (highReg.slope < 0 && lowReg.slope < 0 && Math.abs(highReg.slope) > Math.abs(lowReg.slope)) {
      patterns.push({
        id: generateId(),
        symbol, exchange, type: 'wedge_falling', timeframe,
        confidence: 0.65,
        points: [
          { price: recent[0].low, timestamp: recent[0].timestamp },
          { price: recent[recent.length - 1].low, timestamp: recent[recent.length - 1].timestamp },
        ],
        description: 'Falling wedge - bullish reversal expected',
        direction: 'bullish',
        detectedAt: Date.now(),
        status: 'forming',
      });
    }

    return patterns;
  }

  private detectBOS(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-20);
    if (recent.length < 10) return patterns;

    // Find the most recent swing high
    let maxHigh = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i].high > maxHigh) {
        maxHigh = recent[i].high;
        maxIdx = i;
      }
    }

    // Check if current candle breaks above it (BOS)
    const last = recent[recent.length - 1];
    if (last.close > maxHigh && maxIdx < recent.length - 3) {
      patterns.push({
        id: generateId(),
        symbol, exchange, type: 'bos', timeframe,
        confidence: 0.75,
        points: [
          { price: maxHigh, timestamp: recent[maxIdx].timestamp },
          { price: last.close, timestamp: last.timestamp },
        ],
        description: `Break of Structure (bullish) - broke above ${maxHigh.toFixed(4)}`,
        direction: 'bullish',
        detectedAt: Date.now(),
        status: 'confirmed',
      });
    }

    // Bearish BOS
    let minLow = Infinity;
    let minIdx = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i].low < minLow) {
        minLow = recent[i].low;
        minIdx = i;
      }
    }

    if (last.close < minLow && minIdx < recent.length - 3) {
      patterns.push({
        id: generateId(),
        symbol, exchange, type: 'bos', timeframe,
        confidence: 0.75,
        points: [
          { price: minLow, timestamp: recent[minIdx].timestamp },
          { price: last.close, timestamp: last.timestamp },
        ],
        description: `Break of Structure (bearish) - broke below ${minLow.toFixed(4)}`,
        direction: 'bearish',
        detectedAt: Date.now(),
        status: 'confirmed',
      });
    }

    return patterns;
  }

  private detectCHOCH(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-30);
    if (recent.length < 15) return patterns;

    // Detect change of character: trend reversal with structure break
    // Simplified: look for a sequence of lower highs after higher highs (or vice versa)
    const highs: number[] = [];
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high) {
        highs.push(recent[i].high);
      }
    }

    if (highs.length >= 3) {
      const last3 = highs.slice(-3);
      // Bearish CHOCH: lower highs
      if (last3[2] < last3[1] && last3[1] < last3[0]) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'choch', timeframe,
          confidence: 0.65,
          points: last3.map((p, i) => ({ price: p, timestamp: recent[recent.length - 3 + i]?.timestamp || Date.now() })),
          description: 'Change of Character (bearish) - trend reversal signal',
          direction: 'bearish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }
      // Bullish CHOCH: higher highs after lower highs
      if (last3[2] > last3[1] && last3[1] > last3[0]) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'choch', timeframe,
          confidence: 0.65,
          points: last3.map((p, i) => ({ price: p, timestamp: recent[recent.length - 3 + i]?.timestamp || Date.now() })),
          description: 'Change of Character (bullish) - trend reversal signal',
          direction: 'bullish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }
    }

    return patterns;
  }

  private detectFVG(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (let i = 2; i < candles.length; i++) {
      const [c1, c2, c3] = [candles[i - 2], candles[i - 1], candles[i]];

      // Bullish FVG: gap between candle 1 high and candle 3 low
      if (c3.low > c1.high && c2.close > c2.open) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'fvg', timeframe,
          confidence: 0.7,
          points: [
            { price: c1.high, timestamp: c1.timestamp },
            { price: c3.low, timestamp: c3.timestamp },
          ],
          description: `Bullish Fair Value Gap: ${c1.high.toFixed(4)} - ${c3.low.toFixed(4)}`,
          direction: 'bullish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }

      // Bearish FVG: gap between candle 3 high and candle 1 low
      if (c3.high < c1.low && c2.close < c2.open) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'fvg', timeframe,
          confidence: 0.7,
          points: [
            { price: c1.low, timestamp: c1.timestamp },
            { price: c3.high, timestamp: c3.timestamp },
          ],
          description: `Bearish Fair Value Gap: ${c3.high.toFixed(4)} - ${c1.low.toFixed(4)}`,
          direction: 'bearish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }
    }

    return patterns.slice(-5); // Return last 5 FVGs
  }

  private detectOrderBlocks(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-50);

    for (let i = 1; i < recent.length - 1; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      const next = recent[i + 1];

      // Bullish order block: bearish candle followed by strong bullish move
      if (curr.close < curr.open && next.close > next.open && next.close > curr.high) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'order_block', timeframe,
          confidence: 0.65,
          points: [
            { price: curr.low, timestamp: curr.timestamp },
            { price: curr.high, timestamp: curr.timestamp },
          ],
          description: `Bullish Order Block at ${curr.low.toFixed(4)}-${curr.high.toFixed(4)}`,
          direction: 'bullish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }

      // Bearish order block: bullish candle followed by strong bearish move
      if (curr.close > curr.open && next.close < next.open && next.close < curr.low) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'order_block', timeframe,
          confidence: 0.65,
          points: [
            { price: curr.low, timestamp: curr.timestamp },
            { price: curr.high, timestamp: curr.timestamp },
          ],
          description: `Bearish Order Block at ${curr.low.toFixed(4)}-${curr.high.toFixed(4)}`,
          direction: 'bearish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }
    }

    return patterns.slice(-5);
  }

  private detectLiquiditySweeps(
    candles: Candle[], symbol: string, exchange: ExchangeId, timeframe: Timeframe,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const recent = candles.slice(-30);

    for (let i = 5; i < recent.length; i++) {
      const window = recent.slice(i - 5, i);
      const curr = recent[i];

      // Find the highest high in the window
      const maxHigh = Math.max(...window.map(c => c.high));
      // Sweep above then close below
      if (curr.high > maxHigh && curr.close < maxHigh) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'liquidity_sweep', timeframe,
          confidence: 0.7,
          points: [
            { price: maxHigh, timestamp: window.find(c => c.high === maxHigh)?.timestamp || curr.timestamp },
            { price: curr.close, timestamp: curr.timestamp },
          ],
          description: `Liquidity sweep above ${maxHigh.toFixed(4)} - potential reversal`,
          direction: 'bearish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }

      // Find the lowest low in the window
      const minLow = Math.min(...window.map(c => c.low));
      // Sweep below then close above
      if (curr.low < minLow && curr.close > minLow) {
        patterns.push({
          id: generateId(),
          symbol, exchange, type: 'liquidity_sweep', timeframe,
          confidence: 0.7,
          points: [
            { price: minLow, timestamp: window.find(c => c.low === minLow)?.timestamp || curr.timestamp },
            { price: curr.close, timestamp: curr.timestamp },
          ],
          description: `Liquidity sweep below ${minLow.toFixed(4)} - potential reversal`,
          direction: 'bullish',
          detectedAt: Date.now(),
          status: 'confirmed',
        });
      }
    }

    return patterns.slice(-3);
  }

  private linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: points[0]?.y || 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  // Storage & retrieval
  async storePattern(pattern: DetectedPattern): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO detected_patterns (id, symbol, exchange, type, timeframe, confidence, points, description, direction, target_price, stop_loss, status, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [pattern.id, pattern.symbol, pattern.exchange, pattern.type, pattern.timeframe,
         pattern.confidence, JSON.stringify(pattern.points), pattern.description,
         pattern.direction, pattern.targetPrice, pattern.stopLoss, pattern.status, pattern.detectedAt],
      );
    } catch (err) {
      console.error('Failed to store pattern:', err);
    }
  }

  async getPatterns(params: {
    symbol?: string;
    exchange?: ExchangeId;
    type?: PatternType;
    timeframe?: Timeframe;
    status?: string;
    limit?: number;
  }): Promise<DetectedPattern[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.symbol) { conditions.push(`symbol = $${idx++}`); values.push(params.symbol); }
    if (params.exchange) { conditions.push(`exchange = $${idx++}`); values.push(params.exchange); }
    if (params.type) { conditions.push(`type = $${idx++}`); values.push(params.type); }
    if (params.timeframe) { conditions.push(`timeframe = $${idx++}`); values.push(params.timeframe); }
    if (params.status) { conditions.push(`status = $${idx++}`); values.push(params.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 50;

    const result = await this.db.query<DetectedPattern>(
      `SELECT id, symbol, exchange, type, timeframe, confidence, points, description,
              direction, target_price as "targetPrice", stop_loss as "stopLoss",
              status, detected_at as "detectedAt"
       FROM detected_patterns ${where}
       ORDER BY detected_at DESC
       LIMIT $${idx}`,
      [...values, limit],
    );

    return result.rows;
  }

  addToActive(patterns: DetectedPattern[]): void {
    this.activePatterns.push(...patterns);
    if (this.activePatterns.length > this.MAX_PATTERNS) {
      this.activePatterns = this.activePatterns.slice(-this.MAX_PATTERNS);
    }
  }

  getActivePatterns(): DetectedPattern[] {
    return this.activePatterns;
  }
}
