export function formatDisplaySymbol(symbol: string): string {
  return symbol.replace(/:[A-Z0-9_-]+$/i, '');
}

export function getDisplayBaseSymbol(symbol: string): string {
  return formatDisplaySymbol(symbol).split('/')[0] ?? symbol;
}

export function formatMarketTypeLabel(marketType: 'spot' | 'futures'): string {
  return marketType === 'futures' ? 'Futures' : 'Spot';
}
