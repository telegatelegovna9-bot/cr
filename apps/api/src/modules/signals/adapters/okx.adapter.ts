import type { NormalizedTradeEvent } from '../signals.types';

export function normalizeOkxTrade(input: {
  instId: string;
  ts: string | number;
  px: string;
  sz: string;
  side: 'buy' | 'sell' | string;
  isBlockTrade?: boolean;
}): NormalizedTradeEvent {
  const symbol = String(input.instId);
  const [baseAsset, quoteAsset = 'USDT'] = symbol.split('-');
  const price = Number(input.px);
  const quantity = Number(input.sz);

  return {
    id: `okx-${symbol}-${input.ts}-${input.px}-${input.sz}`,
    timestamp: Number(input.ts),
    exchange: 'okx',
    symbol,
    baseAsset,
    quoteAsset,
    side: input.side === 'buy' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: Boolean(input.isBlockTrade),
  };
}
