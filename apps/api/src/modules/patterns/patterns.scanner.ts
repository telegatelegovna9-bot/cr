import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Ticker } from '@crypto-screener/shared';
import { MarketService } from '../market/market.service';
import {
  PATTERN_CANDLE_LIMIT,
  PATTERN_SCAN_BATCH_SIZE,
  PATTERN_MIN_QUALITY,
  PATTERN_SCAN_CONCURRENCY,
} from './patterns.constants';
import { type PatternTimeframe, PATTERN_SCAN_TIMEFRAMES } from './patterns.types';
import { type PatternCandidate } from './detectors/detector.types';
import {
  patternsOverlapTooMuch,
  runWithConcurrencyLimit,
  scanDetectorAcrossWindows,
} from './detectors/detector.utils';
import { refinePatternActionability } from './detectors/pattern-actionability';
import { detectTrianglePatterns } from './detectors/triangle.detector';
import { PatternsService } from './patterns.service';
import { selectSymbolsForScan } from './patterns.scanner.utils';

@Injectable()
export class PatternsScanner implements OnModuleInit {
  private readonly logger = new Logger(PatternsScanner.name);
  private isScanRunning = false;
  private batchIndex = 0;

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
      const { symbols, totalUniverse, activeBatch } = this.getBinanceFuturesSymbolsForCurrentBatch();
      this.logger.log(
        `Patterns scan started via ${source} for ${symbols.length}/${totalUniverse} symbols (batch ${activeBatch})`,
      );
      
      const symbolTimeframeTasks = symbols.flatMap(symbol =>
        PATTERN_SCAN_TIMEFRAMES.map(timeframe => async () =>
          this.scanSymbolTimeframe(symbol, timeframe as any),
        ),
      );
      
      const taskResults = await runWithConcurrencyLimit(
        symbolTimeframeTasks,
        PATTERN_SCAN_CONCURRENCY,
      );
      
      const candidates: PatternCandidate[] = [];
      let rawCandidateCount = 0;

      for (const detected of taskResults) {
        if (!detected) continue;
        rawCandidateCount += detected.length;
        for (const candidate of detected) {
          // Strict overlap check
          const duplicate = candidates.find(existing =>
            patternsOverlapTooMuch(existing, candidate) && existing.quality >= candidate.quality,
          );

          if (!duplicate) {
            candidates.push(candidate);
          }
        }
      }

      const activeCandidates = candidates.filter(c => c.quality >= PATTERN_MIN_QUALITY);
      await this.patternsService.upsertScannerSnapshot(activeCandidates);
      await this.patternsService.expireStaleFinishedPatterns();

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Patterns scan stored ${activeCandidates.length} triangle candidates in ${durationMs}ms (raw ${rawCandidateCount}, deduped ${candidates.length})`,
      );
      this.batchIndex += 1;
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

    if (candles.length < 50) {
      return [];
    }

    const scannedCandidates = scanDetectorAcrossWindows(
      symbol,
      timeframe,
      candles,
      detectTrianglePatterns,
    );

    const actionableCandidates: PatternCandidate[] = [];
    for (const candidate of scannedCandidates) {
      const actionability = refinePatternActionability(candidate, candles, timeframe);
      if (!actionability.keep) {
        continue;
      }

      actionableCandidates.push({
        ...candidate,
        quality: actionability.quality,
      });
    }

    return actionableCandidates.sort((a, b) => b.quality - a.quality);
  }

  private getBinanceFuturesSymbolsForCurrentBatch(): {
    symbols: string[];
    totalUniverse: number;
    activeBatch: number;
  } {
    const tickers = this.marketService.getTickers('binance');
    const universe = Array.from(
      new Set(
        tickers
          .filter((ticker: Ticker) => ticker.marketType === 'futures')
          .map((ticker: Ticker) => ticker.symbol),
      ),
    );
    const totalBatches = Math.max(1, Math.ceil(universe.length / PATTERN_SCAN_BATCH_SIZE));
    const activeBatch = this.batchIndex % totalBatches;

    return {
      symbols: selectSymbolsForScan(tickers, PATTERN_SCAN_BATCH_SIZE, this.batchIndex),
      totalUniverse: universe.length,
      activeBatch: activeBatch + 1,
    };
  }
}
