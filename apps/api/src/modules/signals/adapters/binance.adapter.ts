import type { NormalizedTradeEvent } from '../signals.types';

function parseBinanceQuoteAsset(symbol: string) {
  const knownQuotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'USD'];
  const quoteAsset = knownQuotes.find(quote => symbol.endsWith(quote)) ?? 'USD';
  const baseAsset = symbol.slice(0, symbol.length - quoteAsset.length) || symbol;
  return { baseAsset, quoteAsset };
}

export function normalizeBinanceAggTrade(input: {
  s: string;
  p: string;
  q: string;
  m: boolean;
  T: number;
}): NormalizedTradeEvent {
  const symbol = String(input.s);
  const price = Number(input.p);
  const quantity = Number(input.q);
  const { baseAsset, quoteAsset } = parseBinanceQuoteAsset(symbol);

  return {
    id: `binance-${symbol}-${input.T}-${input.p}-${input.q}`,
    timestamp: Number(input.T),
    exchange: 'binance',
    symbol,
    baseAsset,
    quoteAsset,
    side: input.m ? 'sell' : 'buy',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
