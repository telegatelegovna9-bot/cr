import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MarketService } from '../market/market.service';
import type { ScreenerFilter, ScreenerSortField, ExchangeId, Ticker } from '@crypto-screener/shared';
import { SCREENER_DEFAULT_PAGE_SIZE } from '@crypto-screener/shared';
import { toExchangeSymbol } from '@crypto-screener/shared';
import {
  SCREENER_COMPUTE_INTERVAL_MS,
  SCREENER_FUTURES_UNIVERSE_SYMBOLS,
  SCREENER_OI_POLL_INTERVAL_MS,
  SCREENER_PREFERRED_EXCHANGES,
  SCREENER_SAMPLE_INTERVAL_MS,
  SCREENER_SPOT_UNIVERSE_SYMBOLS,
  SCREENER_SUPPORTED_EXCHANGES,
  SCREENER_TAKER_POLL_INTERVAL_MS,
  SCREENER_UNIVERSE_SYMBOLS,
  toScreenerFuturesSymbol,
} from './screener.config';
import { ScreenerEngine } from './screener.engine';
import { ScreenerStore } from './screener.store';
import type {
  ScreenerFeedResponse,
  ScreenerHealth,
  ScreenerHealthResponse,
  ScreenerRow,
  ScreenerSummary,
  ScreenerSummaryResponse,
} from './screener.types';

export interface ScreenerResult {
  symbol: string;
  exchange: string;
  lastPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  quoteVolume24h: number;
  trades24h: number;
  high24h: number;
  low24h: number;
  volatility: number;
  spread: number;
  bid: number;
  ask: number;
}

@Injectable()
export class ScreenerService implements OnModuleInit {
  private readonly logger = new Logger(ScreenerService.name);

  constructor(
    private readonly marketService: MarketService,
    private readonly store: ScreenerStore,
    private readonly engine: ScreenerEngine,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const symbol of SCREENER_FUTURES_UNIVERSE_SYMBOLS) {
      this.marketService.subscribeSymbol(symbol);
    }
    this.collectMarketSamples();
    this.recomputeSnapshot();
    await this.pollOpenInterest();
    await this.pollTakerBuySellRatio();
    this.recomputeSnapshot();
  }

  listRows(): ScreenerFeedResponse {
    return {
      items: this.store.getRows(),
      timestamp: Date.now(),
    };
  }

  getSummary(): ScreenerSummaryResponse {
    return {
      summary: this.store.getSummary(),
      timestamp: Date.now(),
    };
  }

  getHealth(): ScreenerHealthResponse {
    return {
      health: this.store.getHealth(),
      timestamp: Date.now(),
    };
  }

  @Interval(SCREENER_SAMPLE_INTERVAL_MS)
  collectMarketSamples(): void {
    const tickers = this.marketService.getTickers(undefined, SCREENER_UNIVERSE_SYMBOLS);

    for (const symbol of SCREENER_UNIVERSE_SYMBOLS) {
      const candidates = tickers.filter(ticker =>
        ticker.symbol === symbol
        && SCREENER_SUPPORTED_EXCHANGES.has(ticker.exchange as ExchangeId),
      );

      const selected = this.selectPreferredTicker(candidates);
      if (!selected) continue;

      this.store.recordTicker(selected);
    }

    this.store.prune();
  }

  @Interval(SCREENER_COMPUTE_INTERVAL_MS)
  recomputeSnapshot(): void {
    const { rows, summary } = this.engine.build();
    this.store.setSnapshot(rows, summary);
  }

  @Interval(SCREENER_OI_POLL_INTERVAL_MS)
  async pollOpenInterest(): Promise<void> {
    await Promise.all(
      SCREENER_SPOT_UNIVERSE_SYMBOLS.map(async symbol => {
        try {
          const exchangeSymbol = toExchangeSymbol(symbol, 'binance');
          const response = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${exchangeSymbol}`);
          if (!response.ok) return;

          const payload = await response.json() as { openInterest?: string };
          const openInterest = Number(payload.openInterest);
          if (!Number.isFinite(openInterest)) return;

          this.store.recordOpenInterest('binance', toScreenerFuturesSymbol(symbol), openInterest);
        } catch (error) {
          this.logger.debug(`Failed to poll open interest for ${symbol}`);
        }
      }),
    );

    this.store.prune();
  }

  @Interval(SCREENER_TAKER_POLL_INTERVAL_MS)
  async pollTakerBuySellRatio(): Promise<void> {
    await Promise.all(
      SCREENER_SPOT_UNIVERSE_SYMBOLS.map(async symbol => {
        try {
          const exchangeSymbol = toExchangeSymbol(symbol, 'binance');
          const response = await fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${exchangeSymbol}&period=5m&limit=1`);
          if (!response.ok) return;

          const payload = await response.json() as Array<{ buySellRatio?: string; timestamp?: string | number }>;
          const latest = payload[0];
          const ratio = Number(latest?.buySellRatio);
          if (!Number.isFinite(ratio)) return;

          const timestamp = latest?.timestamp ? Number(latest.timestamp) : Date.now();
          this.store.recordTakerBuyRatio('binance', toScreenerFuturesSymbol(symbol), ratio, timestamp);
        } catch (error) {
          this.logger.debug(`Failed to poll taker ratio for ${symbol}`);
        }
      }),
    );

    this.store.prune();
  }

  screen(params: {
    filters?: ScreenerFilter[];
    sortBy?: ScreenerSortField;
    sortDirection?: 'asc' | 'desc';
    exchange?: ExchangeId;
    page?: number;
    pageSize?: number;
  }): { results: ScreenerResult[]; total: number } {
    let tickers = this.marketService.getTickers(params.exchange);

    // Map to screener results
    let results: ScreenerResult[] = tickers.map(t => ({
      symbol: t.symbol,
      exchange: t.exchange,
      lastPrice: t.lastPrice,
      priceChange24h: t.priceChange24h,
      priceChangePercent24h: t.priceChangePercent24h || 0,
      volume24h: t.volume24h,
      quoteVolume24h: t.quoteVolume24h || 0,
      trades24h: t.trades24h || 0,
      high24h: t.high24h,
      low24h: t.low24h,
      volatility: t.volatility || 0,
      spread: t.spread || 0,
      bid: t.bid || 0,
      ask: t.ask || 0,
    }));

    // Apply filters
    if (params.filters?.length) {
      for (const filter of params.filters) {
        results = results.filter(r => this.applyFilter(r, filter));
      }
    }

    // Sort
    const sortBy = params.sortBy || 'volume24h';
    const dir = params.sortDirection || 'desc';
    results.sort((a, b) => {
      const aVal = (a as unknown as Record<string, number>)[sortBy] || 0;
      const bVal = (b as unknown as Record<string, number>)[sortBy] || 0;
      return dir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Pagination
    const total = results.length;
    const page = params.page || 1;
    const pageSize = params.pageSize || SCREENER_DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    results = results.slice(start, start + pageSize);

    return { results, total };
  }

  private selectPreferredTicker(candidates: Ticker[]): Ticker | null {
    for (const exchange of SCREENER_PREFERRED_EXCHANGES) {
      const futuresTicker = candidates.find(ticker => ticker.exchange === exchange && (ticker.marketType ?? 'spot') === 'futures');
      if (futuresTicker) return futuresTicker;
    }

    for (const exchange of SCREENER_PREFERRED_EXCHANGES) {
      const spotTicker = candidates.find(ticker => ticker.exchange === exchange && (ticker.marketType ?? 'spot') === 'spot');
      if (spotTicker) return spotTicker;
    }

    return candidates[0] ?? null;
  }

  private applyFilter(item: ScreenerResult, filter: ScreenerFilter): boolean {
    const value = (item as unknown as Record<string, number>)[filter.field];
    if (value === undefined) return true;

    switch (filter.operator) {
      case 'gt': return value > (filter.value as number);
      case 'lt': return value < (filter.value as number);
      case 'eq': return value === (filter.value as number);
      case 'gte': return value >= (filter.value as number);
      case 'lte': return value <= (filter.value as number);
      case 'between': {
        const [min, max] = filter.value as number[];
        return value >= min && value <= max;
      }
      case 'in': return (filter.value as number[]).includes(value);
      default: return true;
    }
  }
}
