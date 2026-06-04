export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface LiquidityBand {
  price: number;
  usd: number;
  side: 'bid' | 'ask';
  intensity: number;
}

export interface BuildLiquidityBucketsArgs {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  currentPrice: number;
  bucketSize: number;
  depthPct: number;
}

export function createBucketWindow({ currentPrice, depthPct }: { currentPrice: number; depthPct: number }) {
  return {
    minPrice: currentPrice * (1 - depthPct),
    maxPrice: currentPrice * (1 + depthPct),
  };
}

function roundToBucket(price: number, bucketSize: number) {
  return Math.round(price / bucketSize) * bucketSize;
}

export function mergeBookSideIntoBuckets({
  buckets,
  levels,
  bucketSize,
}: {
  buckets: Map<number, number>;
  levels: OrderbookLevel[];
  bucketSize: number;
}) {
  for (const level of levels) {
    const bucketPrice = roundToBucket(level.price, bucketSize);
    buckets.set(bucketPrice, (buckets.get(bucketPrice) || 0) + level.quantity);
  }
}

function buildSideBands(
  side: 'bid' | 'ask',
  levels: OrderbookLevel[],
  currentPrice: number,
  bucketSize: number,
  depthPct: number,
): LiquidityBand[] {
  const { minPrice, maxPrice } = createBucketWindow({ currentPrice, depthPct });
  const buckets = new Map<number, number>();

  mergeBookSideIntoBuckets({
    buckets,
    levels: levels.filter(level => level.price >= minPrice && level.price <= maxPrice),
    bucketSize,
  });

  let maxQty = 0;
  for (const qty of buckets.values()) {
    if (qty > maxQty) maxQty = qty;
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([price, quantity]) => ({
      price,
      usd: price * quantity,
      side,
      intensity: maxQty > 0 ? quantity / maxQty : 0,
    }));
}

export function buildLiquidityBuckets({
  bids,
  asks,
  currentPrice,
  bucketSize,
  depthPct,
}: BuildLiquidityBucketsArgs): LiquidityBand[] {
  return [
    ...buildSideBands('bid', bids, currentPrice, bucketSize, depthPct),
    ...buildSideBands('ask', asks, currentPrice, bucketSize, depthPct),
  ].sort((a, b) => a.price - b.price);
}
