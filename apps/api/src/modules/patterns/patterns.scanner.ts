import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Ticker } from '@crypto-screener/shared';
import { MarketService } from '../market/market.service';
import { PATTERN_CANDLE_LIMIT, PATTERN_MIN_QUALITY } from './patterns.constants';
import { type PatternTimeframe, PATTERN_SCAN_TIMEFRAMES } from './patterns.types';
import { type PatternCandidate } from './detectors/detector.types';
import { detectCascadePatterns } from './detectors/cascade.detector';
import { patternsOverlapTooMuch, scanDetectorAcrossWindows } from './detectors/detector.utils';
import { detectTrendlinePatterns } from './detectors/trendline.detector';
import { detectTrianglePatterns } from './detectors/triangle.detector';
import { PatternsService } from './patterns.service';

@Injectable()
export class PatternsScanner implements OnModuleInit {
  private readonly logger = new Logger(PatternsScanner.name);

  constructor(
    private readonly patternsService: PatternsService,
    private readonly marketService: MarketService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Patterns scanner initialized');
    void this.runScan('startup');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanMarket(): Promise<void> {
    await this.runScan('cron');
  }

  private async runScan(source: 'startup' | 'cron'): Promise<void> {
    try {
      const symbols = this.getBinanceFuturesSymbols();
      const candidates: PatternCandidate[] = [];
      this.logger.log(`Patterns scan started via ${source} for ${symbols.length} symbols`);

      for (const symbol of symbols) {
        for (const timeframe of PATTERN_SCAN_TIMEFRAMES) {
          const candles = await this.marketService.getCandles(
            symbol,
            timeframe,
            'binance',
            PATTERN_CANDLE_LIMIT,
          );

          if (candles.length < 6) {
            continue;
          }

          const detected = [
            ...scanDetectorAcrossWindows(symbol, timeframe, candles, detectCascadePatterns),
            ...scanDetectorAcrossWindows(symbol, timeframe, candles, detectTrendlinePatterns),
            ...scanDetectorAcrossWindows(symbol, timeframe, candles, detectTrianglePatterns),
          ]
            .filter(candidate => candidate.quality >= PATTERN_MIN_QUALITY)
            .sort((a, b) => b.quality - a.quality);

          for (const candidate of detected) {
            const duplicate = candidates.find(existing =>
              patternsOverlapTooMuch(existing, candidate) && existing.quality >= candidate.quality,
            );

            if (!duplicate) {
              candidates.push(candidate);
            }
          }
        }
      }

      await this.patternsService.upsertScannerSnapshot(candidates);
      await this.patternsService.expireStaleFinishedPatterns();

      this.logger.log(`Patterns scan stored ${candidates.length} candidates`);
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error(`Patterns scan failed via ${source}: ${message}`);
    }
  }

  private getBinanceFuturesSymbols(): string[] {
    const tickers = this.marketService.getTickers('binance');

    return Array.from(
      new Set(
        tickers
          .filter((ticker: Ticker) => ticker.marketType === 'futures')
          .map((ticker: Ticker) => ticker.symbol),
      ),
    );
  }
}
