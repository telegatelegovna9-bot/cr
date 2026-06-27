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

test('sound diff resets cleanly on preset change baseline', () => {
  const first = diffNewScreenerMatches([], ['binance|spot|BTC/USDT']);
  const second = diffNewScreenerMatches(['binance|spot|BTC/USDT'], ['binance|spot|BTC/USDT']);

  assert.deepEqual(first, ['binance|spot|BTC/USDT']);
  assert.deepEqual(second, []);
});
