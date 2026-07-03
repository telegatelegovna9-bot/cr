import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Trade } from '@crypto-screener/shared';
import { appendTradesBatch } from './trade-batch.ts';

function makeTrade(id: string, symbol = 'BTC/USDT', timestamp = 1): Trade {
  return {
    id,
    exchange: 'binance',
    marketType: 'spot',
    symbol,
    price: 100,
    quantity: 1,
    side: 'buy',
    timestamp,
  };
}

test('appendTradesBatch appends multiple trades for one market in order and trims to max size', () => {
  const next = appendTradesBatch(new Map(), [
    makeTrade('1', 'BTC/USDT', 1),
    makeTrade('2', 'BTC/USDT', 2),
    makeTrade('3', 'BTC/USDT', 3),
  ], 2);

  const trades = next.get('binance:spot:BTC/USDT') ?? [];
  assert.deepEqual(trades.map(trade => trade.id), ['2', '3']);
});

test('appendTradesBatch updates multiple market buckets in one pass', () => {
  const next = appendTradesBatch(new Map(), [
    makeTrade('1', 'BTC/USDT', 1),
    makeTrade('2', 'ETH/USDT', 2),
    makeTrade('3', 'BTC/USDT', 3),
  ], 10);

  assert.deepEqual(
    (next.get('binance:spot:BTC/USDT') ?? []).map(trade => trade.id),
    ['1', '3'],
  );
  assert.deepEqual(
    (next.get('binance:spot:ETH/USDT') ?? []).map(trade => trade.id),
    ['2'],
  );
});
