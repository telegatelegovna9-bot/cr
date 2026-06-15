import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Ticker } from '@crypto-screener/shared';
import { MarketService } from '../market/market.service';
import {
  PATTERN_CANDLE_LIMIT,
  PATTERN_SCAN_BATCH_SIZE,
  PATTERN_MIN_QUALITY,
  PATTERN_SCAN_CONCURRENCY,
  PATTERN_MAX_ACTIVE_RESULTS,
} from './patterns.constants';
import { type PatternTimeframe, PATTERN_SCAN_TIMEFRAMES } from './patterns.types';
import { type PatternCandidate } from './detectors/detector.types';
import {
  patternsOverlapTooMuch,
  runWithConcurrencyLimit,
} from './detectors/detector.utils';
import { refinePatternActionability } from './detectors/pattern-actionability';
import { detectBreakoutSetups } from './detectors/breakout.detector';
import { detectRetestSetups } from './detectors/retest.detector';
import { detectStructureBreakSetups } from './detectors/structure-break.detector';
import { detectLiquiditySweepSetups } from './detectors/liquidity-sweep.detector';
import { detectTriangleSetups } from './detectors/triangle.detector';
import { detectWedgeSetups } from './detectors/wedge.detector';
import { detectFlagSetups } from './detectors/flag.detector';
import { detectCascadeSetups } from './detectors/cascade.detector';
import { detectFvgSetups } from './detectors/fvg.detector';
import { PatternsService } from './patterns.service';
import {
  getEligibleBinanceFuturesTickers,
  selectSymbolsForScan,
} from './patterns.scanner.utils';

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
          this.scanSymbolTimeframe(symbol, timeframe as PatternTimeframe),
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
          const duplicate = candidates.find(existing =>
            patternsOverlapTooMuch(existing, candidate) && existing.quality >= candidate.quality,
          );

          if (!duplicate) {
            candidates.push(candidate);
          }
        }
      }

      const activeCandidates = candidates
        .filter(c => c.quality >= PATTERN_MIN_QUALITY)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'forming' ? -1 : 1;
          return b.quality - a.quality;
        })
        .slice(0, PATTERN_MAX_ACTIVE_RESULTS);

      const scanNow = Date.now();
      await this.patternsService.upsertScannerSnapshot(activeCandidates, scanNow);
      await this.patternsService.reconcileScannerSnapshot(
        symbols,
        activeCandidates.map(candidate => candidate.id),
        scanNow,
      );
      await this.patternsService.expireStaleFinishedPatterns();

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Patterns scan stored ${activeCandidates.length} setup candidates in ${durationMs}ms (raw ${rawCandidateCount}, deduped ${candidates.length})`,
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

    if (candles.length < 60) {
      return [];
    }

    const scannedCandidates = [
      ...detectBreakoutSetups(symbol, timeframe, candles),
      ...detectRetestSetups(symbol, timeframe, candles),
      ...detectStructureBreakSetups(symbol, timeframe, candles),
      ...detectLiquiditySweepSetups(symbol, timeframe, candles),
      ...detectTriangleSetups(symbol, timeframe, candles),
      ...detectWedgeSetups(symbol, timeframe, candles),
      ...detectFlagSetups(symbol, timeframe, candles),
      ...detectCascadeSetups(symbol, timeframe, candles),
      ...detectFvgSetups(symbol, timeframe, candles),
    ];

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

    return actionableCandidates
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'forming' ? -1 : 1;
        return b.quality - a.quality;
      })
      .slice(0, 3); // up from 1 — allow multiple pattern types per symbol/TF
  }

  private getBinanceFuturesSymbolsForCurrentBatch(): {
    symbols: string[];
    totalUniverse: number;
    activeBatch: number;
  } {
    const tickers = this.marketService.getTickers('binance');
    const eligibleTickers = getEligibleBinanceFuturesTickers(tickers);
    const universe = Array.from(
      new Set(eligibleTickers.map((ticker: Ticker) => ticker.symbol)),
    );
    const totalBatches = Math.max(1, Math.ceil(universe.length / PATTERN_SCAN_BATCH_SIZE));
    const activeBatch = this.batchIndex % totalBatches;

    return {
      symbols: selectSymbolsForScan(eligibleTickers, PATTERN_SCAN_BATCH_SIZE, this.batchIndex),
      totalUniverse: universe.length,
      activeBatch: activeBatch + 1,
    };
  }
}
