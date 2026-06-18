export type OrderbookMarketType = 'spot' | 'futures';

export type OrderbookSnapshot = {
  exchange: string;
  symbol: string;
  marketType?: OrderbookMarketType;
};

function normalizeOrderbookMarketType(marketType?: string): OrderbookMarketType {
  return marketType === 'futures' ? 'futures' : 'spot';
}

export function getOrderbookMapKey(
  exchange: string,
  marketType: string | undefined,
  symbol: string,
): string {
  return `${exchange}:${normalizeOrderbookMarketType(marketType)}:${symbol}`;
}

export function getOrderbookMapKeyFromSnapshot(snapshot: OrderbookSnapshot): string {
  return getOrderbookMapKey(snapshot.exchange, snapshot.marketType, snapshot.symbol);
}

export function findPreferredOrderbook<T extends OrderbookSnapshot>(
  books: Map<string, T>,
  exchange: string,
  marketType: string | undefined,
  symbols: string[],
): T | undefined {
  for (const symbol of symbols) {
    const snapshot = books.get(getOrderbookMapKey(exchange, marketType, symbol));
    if (snapshot) return snapshot;
  }
  return undefined;
}
