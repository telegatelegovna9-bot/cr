import { Injectable } from '@nestjs/common';
import { MarketService } from '../market/market.service';
import type { ScreenerFilter, ScreenerSortField, ExchangeId } from '@crypto-screener/shared';
import { SCREENER_DEFAULT_PAGE_SIZE } from '@crypto-screener/shared';

export interface ScreenerResult {
  symbol: string;
  exchange: ExchangeId;
  price: number;
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
export class ScreenerService {
  constructor(private readonly marketService: MarketService) {}

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
      price: t.price,
      priceChange24h: t.priceChange24h,
      priceChangePercent24h: t.priceChangePercent24h,
      volume24h: t.volume24h,
      quoteVolume24h: t.quoteVolume24h,
      trades24h: t.trades24h,
      high24h: t.high24h,
      low24h: t.low24h,
      volatility: t.volatility || 0,
      spread: t.spread,
      bid: t.bid,
      ask: t.ask,
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
