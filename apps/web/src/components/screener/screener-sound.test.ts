import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffNewScreenerMatches } from './screener-sound.ts';

test('sound diff only returns newly matched symbols', () => {
  const added = diffNewScreenerMatches(
    ['binance|spot|BTC/USDT'],
    ['binance|spot|BTC/USDT', 'bybit|spot|ETH/USDT'],
  );

  assert.deepEqual(added, ['bybit|spot|ETH/USDT']);
});
