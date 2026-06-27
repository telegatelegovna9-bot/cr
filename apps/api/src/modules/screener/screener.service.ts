import { Injectable } from '@nestjs/common';
import type { ExchangeId, ScreenerMarketType, ScreenerSnapshotRow } from '@crypto-screener/shared';
import type { TickerWithMeta } from '../market/market.service';
import { MarketService } from '../market/market.service';
import type { ScreenerSnapshotBucket } from './screener.types';
import { buildScreenerSnapshotRow } from './screener.metrics';

@Injectable()
export class ScreenerService {
  private readonly snapshots = new Map<ScreenerMarketType, ScreenerSnapshotRow[]>();
  private readonly updatedAt = new Map<ScreenerMarketType, number>();

  constructor(private readonly marketService: Pick<MarketService, 'getAllTickerValues'>) {}

  refreshFromMarketRows(rows: ScreenerSnapshotRow[]): void {
    const grouped = {
      spot: rows.filter(row => row.marketType === 'spot'),
      futures: rows.filter(row => row.marketType === 'futures'),
    } as const;

    this.updateSnapshot('spot', grouped.spot);
    this.updateSnapshot('futures', grouped.futures);
  }

  updateSnapshot(marketType: ScreenerMarketType, rows: ScreenerSnapshotRow[]): void {
    const bucketRows = rows
      .filter(row => row.marketType === marketType)
      .map(row => this.cloneRow(row));

    this.snapshots.set(marketType, bucketRows);
    this.updatedAt.set(marketType, Date.now());
  }

  listSnapshot(marketType: ScreenerMarketType): ScreenerSnapshotBucket {
    this.refreshFromMarketCache();

    return {
      marketType,
      updatedAt: this.updatedAt.get(marketType) ?? 0,
      rows: (this.snapshots.get(marketType) ?? []).map(row => this.cloneRow(row)),
    };
  }

  readonly buildRow = buildScreenerSnapshotRow;

  private refreshFromMarketCache(): void {
    const tickers = this.marketService.getAllTickerValues();
    if (tickers.length === 0) {
      return;
    }

    this.refreshFromMarketRows(tickers.map(ticker => this.mapTickerToSnapshotRow(ticker)));
  }

  private mapTickerToSnapshotRow(ticker: TickerWithMeta): ScreenerSnapshotRow {
    return this.buildRow({
      ticker: {
        exchange: ticker.exchange as ExchangeId,
        marketType: ticker.marketType,
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        timestamp: ticker.timestamp,
        priceChangePercent24h: ticker.priceChangePercent24h,
        volume24h: ticker.volume24h,
      },
      featureMap: {},
    });
  }

  private cloneRow(row: ScreenerSnapshotRow): ScreenerSnapshotRow {
    return {
      ...row,
      metrics: { ...row.metrics },
    };
  }
}
