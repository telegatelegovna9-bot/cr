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

export interface BubbleTapeItem {
  id: string;
  tradeId: string;
  price: number;
  side: 'buy' | 'sell';
  sizeUsd: number;
  sizeCoin: number;
  timestamp: number;
  createdAt: number;
  ageMs: number;
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
  const step = Math.max(
    estimateTickSize(params.orderbook.asks, params.orderbook.bids),
    centerPrice * 0.0000001,
  );

  const askBuckets = aggregateBuckets(params.orderbook.asks, 'ask', {
    minPrice,
    maxPrice,
    step,
  });
  const bidBuckets = aggregateBuckets(params.orderbook.bids, 'bid', {
    minPrice,
    maxPrice,
    step,
  });
  const asks = buildDenseSideRows('ask', askBuckets, {
    step,
    rowsPerSide,
    bestPrice: bestAsk > 0 ? bestAsk : centerPrice,
    anchorPrice: params.anchorPrice,
  });
  const bids = buildDenseSideRows('bid', bidBuckets, {
    step,
    rowsPerSide,
    bestPrice: bestBid > 0 ? bestBid : centerPrice,
    anchorPrice: params.anchorPrice,
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
  const minSizeUsd = params.minSizeUsd ?? 0;
  const filtered: Array<Trade & { __sizeUsd: number }> = [];
  let maxUsd = 1;

  for (let index = params.trades.length - 1; index >= 0; index -= 1) {
    const trade = params.trades[index];
    const sizeUsd = trade.price * trade.quantity;
    if (sizeUsd < minSizeUsd) continue;
    if (sizeUsd > maxUsd) maxUsd = sizeUsd;
    filtered.push({ ...trade, __sizeUsd: sizeUsd });
  }

  return filtered.map(trade => {
    const intensity = trade.__sizeUsd / maxUsd;
    return {
      id: trade.id,
      price: trade.price,
      side: trade.side,
      sizeUsd: trade.__sizeUsd,
      sizeCoin: trade.quantity,
      timestamp: trade.timestamp,
      intensity,
      isLargePrint: intensity >= 0.55,
    };
  });
}

export function buildBubbleTapeItems(params: {
  trades: Trade[];
  minLargePrintUsd: number;
  now: number;
}): BubbleTapeItem[] {
  let maxUsd = 1;
  const measured = params.trades.map(trade => {
    const sizeUsd = trade.price * trade.quantity;
    if (sizeUsd > maxUsd) maxUsd = sizeUsd;
    return { trade, sizeUsd };
  });

  return measured.map(({ trade, sizeUsd }) => ({
    id: trade.id,
    tradeId: trade.id,
    price: trade.price,
    side: trade.side,
    sizeUsd,
    sizeCoin: trade.quantity,
    timestamp: trade.timestamp,
    createdAt: params.now,
    ageMs: 0,
    intensity: sizeUsd / maxUsd,
    isLargePrint: sizeUsd >= params.minLargePrintUsd,
  }));
}

export function trimBubbleTapeItems(params: {
  items: BubbleTapeItem[];
  now: number;
  maxItems: number;
  ttlMs: number;
}): BubbleTapeItem[] {
  return params.items
    .map(item => ({
      ...item,
      ageMs: Math.max(0, params.now - item.createdAt),
    }))
    .filter(item => item.ageMs <= params.ttlMs)
    .slice(-params.maxItems);
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

function aggregateBuckets(
  levels: OrderBookLevel[],
  side: 'ask' | 'bid',
  params: {
    minPrice: number;
    maxPrice: number;
    step: number;
  },
): Map<number, { sizeCoin: number; sizeUsd: number }> {
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

  return buckets;
}

function buildDenseSideRows(
  side: 'ask' | 'bid',
  buckets: Map<number, { sizeCoin: number; sizeUsd: number }>,
  params: {
    step: number;
    rowsPerSide: number;
    bestPrice: number;
    anchorPrice?: number | null;
  },
): Array<Pick<DomLevelRow, 'price' | 'sizeUsd' | 'sizeCoin' | 'cumulativeUsd'>> {
  const rows: Array<Pick<DomLevelRow, 'price' | 'sizeUsd' | 'sizeCoin' | 'cumulativeUsd'>> = [];
  const basePrice = params.anchorPrice && params.anchorPrice > 0
    ? params.anchorPrice
    : params.bestPrice;
  const anchorPrice = side === 'ask'
    ? Math.ceil(basePrice / params.step) * params.step
    : Math.floor(basePrice / params.step) * params.step;

  let cumulativeUsd = 0;
  for (let index = 0; index < params.rowsPerSide; index += 1) {
    const price = side === 'ask'
      ? anchorPrice + params.step * (params.rowsPerSide - 1 - index)
      : anchorPrice - params.step * index;
    const value = buckets.get(Number(price.toFixed(12))) ?? { sizeCoin: 0, sizeUsd: 0 };
    cumulativeUsd += value.sizeUsd;
    rows.push({
      price,
      sizeUsd: value.sizeUsd,
      sizeCoin: value.sizeCoin,
      cumulativeUsd,
    });
  }

  return rows;
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
      isAnomalous: row.sizeUsd > 0 && anomalyRatio >= ANOMALY_THRESHOLD,
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

function estimateTickSize(asks: OrderBookLevel[], bids: OrderBookLevel[]): number {
  const diffs: number[] = [];
  const collectDiffs = (levels: OrderBookLevel[]) => {
    for (let i = 1; i < Math.min(levels.length, 24); i += 1) {
      const diff = Math.abs(levels[i]!.price - levels[i - 1]!.price);
      if (diff > 0 && Number.isFinite(diff)) diffs.push(diff);
    }
  };

  collectDiffs(asks);
  collectDiffs(bids);

  if (diffs.length === 0) return 0.01;
  return Math.min(...diffs);
}
