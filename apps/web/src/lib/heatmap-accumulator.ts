// Orderbook heatmap data accumulator
// Accumulates orderbook snapshots over time to build a liquidity heatmap

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface OrderbookSnapshot {
  timestamp: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface HeatmapLevel {
  price: number;
  totalVolume: number;
  count: number;
  side: 'bid' | 'ask';
}

export class HeatmapAccumulator {
  private snapshots: OrderbookSnapshot[] = [];
  private maxSnapshots: number;
  private priceStep: number;

  constructor(maxSnapshots = 100, priceStep = 0.01) {
    this.maxSnapshots = maxSnapshots;
    this.priceStep = priceStep;
  }

  addSnapshot(snapshot: OrderbookSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  clear(): void {
    this.snapshots = [];
  }

  // Aggregate all snapshots into price levels with accumulated volume
  getAggregatedLevels(): HeatmapLevel[] {
    if (this.snapshots.length === 0) return [];

    const levelMap = new Map<number, { totalVolume: number; count: number; side: 'bid' | 'ask' }>();

    // Process all snapshots
    for (const snapshot of this.snapshots) {
      // Process bids
      for (const bid of snapshot.bids) {
        const roundedPrice = Math.round(bid.price / this.priceStep) * this.priceStep;
        const existing = levelMap.get(roundedPrice);
        if (existing && existing.side === 'bid') {
          existing.totalVolume += bid.quantity;
          existing.count += 1;
        } else if (!existing) {
          levelMap.set(roundedPrice, {
            totalVolume: bid.quantity,
            count: 1,
            side: 'bid',
          });
        }
      }

      // Process asks
      for (const ask of snapshot.asks) {
        const roundedPrice = Math.round(ask.price / this.priceStep) * this.priceStep;
        const existing = levelMap.get(roundedPrice);
        if (existing && existing.side === 'ask') {
          existing.totalVolume += ask.quantity;
          existing.count += 1;
        } else if (!existing) {
          levelMap.set(roundedPrice, {
            totalVolume: ask.quantity,
            count: 1,
            side: 'ask',
          });
        }
      }
    }

    // Convert to array and sort by price
    const levels: HeatmapLevel[] = [];
    for (const [price, data] of levelMap.entries()) {
      levels.push({
        price,
        totalVolume: data.totalVolume,
        count: data.count,
        side: data.side,
      });
    }

    return levels.sort((a, b) => a.price - b.price);
  }

  // Get top N levels by volume for each side
  getTopLevels(n = 20): { bids: HeatmapLevel[]; asks: HeatmapLevel[] } {
    const allLevels = this.getAggregatedLevels();

    const bids = allLevels
      .filter(l => l.side === 'bid')
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, n);

    const asks = allLevels
      .filter(l => l.side === 'ask')
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, n);

    return { bids, asks };
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}
