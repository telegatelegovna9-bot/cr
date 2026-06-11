import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createChartRecoveryRequestKey,
  requestCoalescedChartRecovery,
  resetChartRecoveryRequestsForTest,
} from './chart-recovery';

test('coalesces in-flight chart recovery requests for the same stream', async () => {
  resetChartRecoveryRequestsForTest();

  const key = createChartRecoveryRequestKey({
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    timeframe: '1m',
    limit: 300,
  });

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return [{ time: 1, close: 1 }];
  };

  const [first, second] = await Promise.all([
    requestCoalescedChartRecovery(key, fetcher),
    requestCoalescedChartRecovery(key, fetcher),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test('does not coalesce different recovery streams', async () => {
  resetChartRecoveryRequestsForTest();

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [{ time: calls, close: calls }];
  };

  await Promise.all([
    requestCoalescedChartRecovery(
      createChartRecoveryRequestKey({
        exchange: 'binance',
        marketType: 'spot',
        symbol: 'BTC/USDT',
        timeframe: '1m',
        limit: 300,
      }),
      fetcher,
    ),
    requestCoalescedChartRecovery(
      createChartRecoveryRequestKey({
        exchange: 'binance',
        marketType: 'spot',
        symbol: 'ETH/USDT',
        timeframe: '1m',
        limit: 300,
      }),
      fetcher,
    ),
  ]);

  assert.equal(calls, 2);
});
