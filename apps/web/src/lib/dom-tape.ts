import type { OrderBook, OrderBookLevel, Trade } from '@crypto-screener/shared';

export interface DomTapeSettings {
  autoCenter: boolean;
  levelsPerSide: number;
  minTapeSizeUsd: number;
}

export const DEFAULT_DOM_TAPE_SETTINGS: DomTapeSettings = {
  autoCenter: true,
  levelsPerSide: 20,
  minTapeSizeUsd: 0,
};

export interface DomLevelRow {
  price: number;
  sizeUsd: number;
  sizeCoin: number;
  cumulativeUsd: number;
  cumulativeCoin: number;
  depthRatio: number;
  anomalyRatio: number;
  isAnomalous: boolean;
}

export interface DomViewModel {
  asks: DomLevelRow[];
  bids: DomLevelRow[];
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadAbs: number;
  spreadPct: number;
  maxDepthUsd: number;
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

const ANOMALY_THRESHOLD = 2.5;

export function buildDomViewModel(params: {
  orderbook: OrderBook;
  levelsPerSide: number;
}): DomViewModel | null {
  const { orderbook, levelsPerSide } = params;

  // Validate and sort
  const rawBids = orderbook.bids
    .filter(l => Number.isFinite(l.price) && Number.isFinite(l.quantity) && l.quantity > 0)
    .sort((a, b) => b.price - a.price);
  const rawAsks = orderbook.asks
    .filter(l => Number.isFinite(l.price) && Number.isFinite(l.quantity) && l.quantity > 0)
    .sort((a, b) => a.price - b.price);

  const bestBid = rawBids[0]?.price ?? 0;
  const bestAsk = rawAsks[0]?.price ?? 0;

  if (bestBid <= 0 && bestAsk <= 0) return null;

  // Take N levels
  const bids = rawBids.slice(0, levelsPerSide);
  const asks = rawAsks.slice(0, levelsPerSide);

  // Build rows with cumulative totals (for asks: cumulative from lowest price up)
  const askRows = buildSideRows(asks);
  const bidRows = buildSideRows(bids);

  // Max USD for depth bar scaling
  const maxDepthUsd = Math.max(
    1,
    ...askRows.map(r => r.sizeUsd),
    ...bidRows.map(r => r.sizeUsd),
  );

  // Enrich with ratios and anomaly detection
  const asksWithRatios = enrichRows(askRows, maxDepthUsd);
  const bidsWithRatios = enrichRows(bidRows, maxDepthUsd);

  const midPrice = bestBid > 0 && bestAsk > 0
    ? (bestBid + bestAsk) / 2
    : bestAsk > 0 ? bestAsk : bestBid;
  const spreadAbs = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = midPrice > 0 ? (spreadAbs / midPrice) * 100 : 0;

  return {
    asks: asksWithRatios,
    bids: bidsWithRatios,
    midPrice,
    bestBid,
    bestAsk,
    spreadAbs,
    spreadPct,
    maxDepthUsd,
  };
}

function buildSideRows(levels: OrderBookLevel[]): DomLevelRow[] {
  const rows: DomLevelRow[] = [];
  let cumulativeUsd = 0;
  let cumulativeCoin = 0;

  for (const level of levels) {
    const sizeUsd = level.price * level.quantity;
    cumulativeUsd += sizeUsd;
    cumulativeCoin += level.quantity;
    rows.push({
      price: level.price,
      sizeUsd,
      sizeCoin: level.quantity,
      cumulativeUsd,
      cumulativeCoin,
      depthRatio: 0,
      anomalyRatio: 0,
      isAnomalous: false,
    });
  }

  return rows;
}

function enrichRows(rows: DomLevelRow[], maxDepthUsd: number): DomLevelRow[] {
  return rows.map((row, index) => {
    const prev = rows[index - 1]?.sizeUsd ?? row.sizeUsd;
    const next = rows[index + 1]?.sizeUsd ?? row.sizeUsd;
    const neighbourAvg = (prev + next) / 2;
    const anomalyRatio = neighbourAvg > 0 ? row.sizeUsd / neighbourAvg : 1;
    return {
      ...row,
      depthRatio: maxDepthUsd > 0 ? row.sizeUsd / maxDepthUsd : 0,
      anomalyRatio,
      isAnomalous: row.sizeUsd > 0 && anomalyRatio >= ANOMALY_THRESHOLD,
    };
  });
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
