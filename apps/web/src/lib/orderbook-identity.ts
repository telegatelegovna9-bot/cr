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
  const normalizedMarketType = normalizeOrderbookMarketType(marketType);

  for (const symbol of symbols) {
    const snapshot = books.get(getOrderbookMapKey(exchange, normalizedMarketType, symbol));
    if (snapshot) return snapshot;
  }

  for (const snapshot of books.values()) {
    if (snapshot.exchange !== exchange) continue;
    if (!symbols.includes(snapshot.symbol)) continue;
    if (normalizeOrderbookMarketType(snapshot.marketType) !== normalizedMarketType) continue;
    return snapshot;
  }

  for (const snapshot of books.values()) {
    if (snapshot.exchange !== exchange) continue;
    if (!symbols.includes(snapshot.symbol)) continue;
    return snapshot;
  }

  return undefined;
}
