import type { NormalizedTradeEvent } from '../signals.types';

export function normalizeCoinbaseTrade(input: {
  product_id: string;
  time: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL' | string;
}): NormalizedTradeEvent {
  const symbol = String(input.product_id);
  const [baseAsset, quoteAsset = 'USD'] = symbol.split('-');
  const price = Number(input.price);
  const quantity = Number(input.size);

  return {
    id: `coinbase-${symbol}-${input.time}-${input.price}-${input.size}`,
    timestamp: Date.parse(String(input.time)),
    exchange: 'coinbase',
    symbol,
    baseAsset,
    quoteAsset,
    side: input.side === 'BUY' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
