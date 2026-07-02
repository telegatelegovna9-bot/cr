import type { OrderBook, OrderBookLevel, Trade } from '@crypto-screener/shared';

export interface DomTapeSettings {
  compressionPct: number;
  autoCenter: boolean;
  tapeSizeMode: 'usd' | 'coin';
  minTapeSizeUsd: number;
}

export const DEFAULT_DOM_TAPE_SETTINGS: DomTapeSettings = {
  compressionPct: 0.02,
  autoCenter: true,
  tapeSizeMode: 'usd',
  minTapeSizeUsd: 0,
};

export interface DomLevelRow {
  price: number;
  sizeUsd: number;
  sizeCoin: number;
  cumulativeUsd: number;
  depthRatio: number;
  anomalyRatio: number;
  isAnomalous: boolean;
}

export interface DomViewModel {
  asks: DomLevelRow[];
  bids: DomLevelRow[];
  midPrice: number;
  spreadAbs: number;
  spreadPct: number;
  step: number;
}

export interface TapeRow {
  id: string;
  price: number;
  side: 'buy' | 'sell';
  sizeUsd: number;
  sizeCoin: number;
  timestamp: number;
  intensity: number;
  isLargePrint: boolean;
}

const DEFAULT_ROWS_PER_SIDE = 18;
const ANOMALY_THRESHOLD = 2.25;

export function buildDomViewModel(params: {
  orderbook: OrderBook;
  compressionPct: number;
  anchorPrice?: number | null;
  rowsPerSide?: number;
}): DomViewModel | null {
  const bestBid = params.orderbook.bids[0]?.price ?? 0;
  const bestAsk = params.orderbook.asks[0]?.price ?? 0;
  const midPrice = bestBid > 0 && bestAsk > 0
    ? (bestBid + bestAsk) / 2
    : bestAsk > 0
      ? bestAsk
      : bestBid > 0
        ? bestBid
        : 0;

  if (midPrice <= 0) {
    return null;
  }

  const centerPrice = params.anchorPrice && params.anchorPrice > 0 ? params.anchorPrice : midPrice;
  const rowsPerSide = params.rowsPerSide ?? DEFAULT_ROWS_PER_SIDE;
  const windowPct = Math.max(0.001, params.compressionPct);
  const halfWindow = centerPrice * windowPct;
  const minPrice = Math.max(0, centerPrice - halfWindow);
  const maxPrice = centerPrice + halfWindow;
  const step = niceStep((maxPrice - minPrice) / (rowsPerSide * 2));

  const asks = aggregateRows(params.orderbook.asks, 'ask', {
    minPrice,
    maxPrice,
    step,
    rowsPerSide,
  });
  const bids = aggregateRows(params.orderbook.bids, 'bid', {
    minPrice,
    maxPrice,
    step,
    rowsPerSide,
  });

  const maxSideUsd = Math.max(
    1,
    ...asks.map(level => level.sizeUsd),
    ...bids.map(level => level.sizeUsd),
  );

  const asksWithRatios = enrichRows(asks, maxSideUsd);
  const bidsWithRatios = enrichRows(bids, maxSideUsd);
  const spreadAbs = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = midPrice > 0 ? (spreadAbs / midPrice) * 100 : 0;

  return {
    asks: asksWithRatios,
    bids: bidsWithRatios,
    midPrice,
    spreadAbs,
    spreadPct,
    step,
  };
}

export function buildTapeRows(params: {
  trades: Trade[];
  minSizeUsd?: number;
}): TapeRow[] {
  const sorted = [...params.trades].sort((a, b) => b.timestamp - a.timestamp);
  const filtered = sorted.filter(trade => trade.price * trade.quantity >= (params.minSizeUsd ?? 0));
  const maxUsd = Math.max(1, ...filtered.map(trade => trade.price * trade.quantity));

  return filtered.map(trade => {
    const sizeUsd = trade.price * trade.quantity;
    const intensity = sizeUsd / maxUsd;
    return {
      id: trade.id,
      price: trade.price,
      side: trade.side,
      sizeUsd,
      sizeCoin: trade.quantity,
      timestamp: trade.timestamp,
      intensity,
      isLargePrint: intensity >= 0.55,
    };
  });
}

export function findPairedMarket(params: {
  symbol: string;
  marketType: 'spot' | 'futures';
  hasTicker: (symbol: string, marketType: 'spot' | 'futures') => boolean;
}): { marketType: 'spot' | 'futures'; symbol: string } | null {
  if (params.marketType === 'futures') {
    const spotSymbol = params.symbol.replace(/:USDT$/, '');
    return params.hasTicker(spotSymbol, 'spot')
      ? { marketType: 'spot', symbol: spotSymbol }
      : null;
  }

  const futuresSymbol = params.symbol.includes(':USDT') ? params.symbol : `${params.symbol}:USDT`;
  return params.hasTicker(futuresSymbol, 'futures')
    ? { marketType: 'futures', symbol: futuresSymbol }
    : null;
}

function aggregateRows(
  levels: OrderBookLevel[],
  side: 'ask' | 'bid',
  params: {
    minPrice: number;
    maxPrice: number;
    step: number;
    rowsPerSide: number;
  },
): Array<Pick<DomLevelRow, 'price' | 'sizeUsd' | 'sizeCoin' | 'cumulativeUsd'>> {
  const buckets = new Map<number, { sizeCoin: number; sizeUsd: number }>();

  for (const level of levels) {
    if (!Number.isFinite(level.price) || !Number.isFinite(level.quantity)) continue;
    if (level.price < params.minPrice || level.price > params.maxPrice) continue;
    const bucketPrice = side === 'ask'
      ? Math.ceil(level.price / params.step) * params.step
      : Math.floor(level.price / params.step) * params.step;
    const current = buckets.get(bucketPrice) ?? { sizeCoin: 0, sizeUsd: 0 };
    current.sizeCoin += level.quantity;
    current.sizeUsd += level.quantity * level.price;
    buckets.set(bucketPrice, current);
  }

  const sorted = [...buckets.entries()]
    .sort((a, b) => side === 'ask' ? a[0] - b[0] : b[0] - a[0])
    .slice(0, params.rowsPerSide);

  if (side === 'ask') {
    sorted.reverse();
  }

  let cumulativeUsd = 0;
  return sorted.map(([price, value]) => {
    cumulativeUsd += value.sizeUsd;
    return {
      price,
      sizeUsd: value.sizeUsd,
      sizeCoin: value.sizeCoin,
      cumulativeUsd,
    };
  });
}

function enrichRows(
  rows: Array<Pick<DomLevelRow, 'price' | 'sizeUsd' | 'sizeCoin' | 'cumulativeUsd'>>,
  maxSideUsd: number,
): DomLevelRow[] {
  return rows.map((row, index) => {
    const neighbourValues = [
      rows[index - 1]?.sizeUsd ?? row.sizeUsd,
      rows[index + 1]?.sizeUsd ?? row.sizeUsd,
    ];
    const neighbourAverage = neighbourValues.reduce((sum, value) => sum + value, 0) / neighbourValues.length;
    const anomalyRatio = neighbourAverage > 0 ? row.sizeUsd / neighbourAverage : 1;
    return {
      ...row,
      depthRatio: row.sizeUsd / maxSideUsd,
      anomalyRatio,
      isAnomalous: anomalyRatio >= ANOMALY_THRESHOLD,
    };
  });
}

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 0.01;

  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}
