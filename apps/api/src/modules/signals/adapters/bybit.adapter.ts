import type { NormalizedTradeEvent } from '../signals.types';

function parseBybitQuoteAsset(symbol: string) {
  if (symbol.endsWith('USDC')) {
    return {
      baseAsset: symbol.slice(0, -4),
      quoteAsset: 'USDC',
    };
  }

  if (symbol.endsWith('USDT')) {
    return {
      baseAsset: symbol.slice(0, -4),
      quoteAsset: 'USDT',
    };
  }

  return {
    baseAsset: symbol,
    quoteAsset: 'USD',
  };
}

export function normalizeBybitTrade(input: {
  s: string;
  p: string;
  v: string;
  S: 'Buy' | 'Sell' | string;
  T: number;
  BT?: boolean;
}): NormalizedTradeEvent {
  const symbol = String(input.s);
  const price = Number(input.p);
  const quantity = Number(input.v);
  const { baseAsset, quoteAsset } = parseBybitQuoteAsset(symbol);

  return {
    id: `bybit-${symbol}-${input.T}-${input.p}-${input.v}`,
    timestamp: Number(input.T),
    exchange: 'bybit',
    symbol,
    baseAsset,
    quoteAsset,
    side: input.S === 'Buy' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: Boolean(input.BT),
  };
}
