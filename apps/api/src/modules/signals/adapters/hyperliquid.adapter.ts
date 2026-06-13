import type { NormalizedTradeEvent } from '../signals.types';

export function normalizeHyperliquidTrade(input: {
  coin: string;
  time: number;
  px: string;
  sz: string;
  side: 'B' | 'A' | string;
}): NormalizedTradeEvent {
  const price = Number(input.px);
  const quantity = Number(input.sz);
  const coin = String(input.coin);

  return {
    id: `hyperliquid-${coin}-${input.time}-${input.px}-${input.sz}`,
    timestamp: Number(input.time),
    exchange: 'hyperliquid',
    symbol: `${coin}/USDC`,
    baseAsset: coin,
    quoteAsset: 'USDC',
    side: input.side === 'B' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
