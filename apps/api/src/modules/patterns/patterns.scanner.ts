import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Ticker } from '@crypto-screener/shared';
import { MarketService } from '../market/market.service';
import {
  PATTERN_CANDLE_LIMIT,
  PATTERN_MIN_QUALITY,
  PATTERN_SCAN_CONCURRENCY,
} from './patterns.constants';
import { type PatternTimeframe, PATTERN_SCAN_TIMEFRAMES } from './patterns.types';
import { type PatternCandidate } from './detectors/detector.types';
import {
  patternsOverlapTooMuch,
  clampQuality,
  runWithConcurrencyLimit,
  scanDetectorAcrossWindows,
} from './detectors/detector.utils';
import { refinePatternActionability } from './detectors/pattern-actionability';
import { detectTrendlinePatterns } from './detectors/trendline.detector';
import { detectTrianglePatterns } from './detectors/triangle.detector';
import { PatternsService } from './patterns.service';

@Injectable()
export class PatternsScanner implements OnModuleInit {
  private readonly logger = new Logger(PatternsScanner.name);
  private isScanRunning = false;

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
    if (this.isScanRunning) {
      this.logger.warn(`Patterns scan skipped via ${source}: previous scan still running`);
      return;
    }

    this.isScanRunning = true;
    const startedAt = Date.now();

    try {
      const symbols = this.getBinanceFuturesSymbols();
      this.logger.log(`Patterns scan started via ${source} for ${symbols.length} symbols`);
      const symbolTimeframeTasks = symbols.flatMap(symbol =>
        PATTERN_SCAN_TIMEFRAMES.map(timeframe => async () =>
          this.scanSymbolTimeframe(symbol, timeframe),
        ),
      );
      const taskResults = await runWithConcurrencyLimit(
        symbolTimeframeTasks,
        PATTERN_SCAN_CONCURRENCY,
      );
      const candidates: PatternCandidate[] = [];

      for (const detected of taskResults) {
        for (const candidate of detected) {
          const duplicate = candidates.find(existing =>
            patternsOverlapTooMuch(existing, candidate) && existing.quality >= candidate.quality,
          );

          if (!duplicate) {
            candidates.push(candidate);
          }
        }
      }

      await this.patternsService.upsertScannerSnapshot(candidates);
      await this.patternsService.expireStaleFinishedPatterns();

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Patterns scan stored ${candidates.length} candidates in ${durationMs}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error(`Patterns scan failed via ${source}: ${message}`);
    } finally {
      this.isScanRunning = false;
    }
  }

  private async scanSymbolTimeframe(
    symbol: string,
    timeframe: PatternTimeframe,
  ): Promise<PatternCandidate[]> {
    const candles = await this.marketService.getCandles(
      symbol,
      timeframe,
      'binance',
      PATTERN_CANDLE_LIMIT,
    );

    if (candles.length < 24) {
      return [];
    }

    return [
      ...scanDetectorAcrossWindows(symbol, timeframe, candles, detectTrendlinePatterns),
      ...scanDetectorAcrossWindows(symbol, timeframe, candles, detectTrianglePatterns),
    ]
      .map(candidate => {
        const actionability = refinePatternActionability(candidate, candles, timeframe);
        return actionability.keep
          ? { ...candidate, quality: clampQuality(actionability.quality) }
          : null;
      })
      .filter((candidate): candidate is PatternCandidate => candidate !== null && candidate.quality >= PATTERN_MIN_QUALITY)
      .sort((a, b) => b.quality - a.quality);
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
