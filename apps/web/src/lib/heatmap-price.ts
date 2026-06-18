import type { OrderBook } from '@crypto-screener/shared';

export function getHeatmapPriceStep(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0.01;
  if (price > 10000) return 10;
  if (price > 1000) return 1;
  if (price > 100) return 0.1;
  if (price > 1) return 0.01;
  return 0.0001;
}

export function resolveHeatmapReferencePrice(params: {
  tickerPrice?: number | null;
  candlePrice?: number | null;
  orderbook?: Pick<OrderBook, 'bids' | 'asks'> | null;
}): number {
  const tickerPrice = params.tickerPrice ?? 0;
  if (Number.isFinite(tickerPrice) && tickerPrice > 0) return tickerPrice;

  const candlePrice = params.candlePrice ?? 0;
  if (Number.isFinite(candlePrice) && candlePrice > 0) return candlePrice;

  const bestBid = params.orderbook?.bids?.[0]?.price ?? 0;
  const bestAsk = params.orderbook?.asks?.[0]?.price ?? 0;
  if (Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0) {
    return (bestBid + bestAsk) / 2;
  }
  if (Number.isFinite(bestBid) && bestBid > 0) return bestBid;
  if (Number.isFinite(bestAsk) && bestAsk > 0) return bestAsk;
  return 0;
}
