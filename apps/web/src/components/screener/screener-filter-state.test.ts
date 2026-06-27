import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCREENER_DEFAULT_EXCHANGES,
  SCREENER_REFRESH_INTERVAL_MS,
} from '@crypto-screener/shared';
import type { ScreenerMarketType, ScreenerMetricKey } from '@crypto-screener/shared';

test('shared screener contracts export market mode and metric keys', () => {
  const marketType: ScreenerMarketType = 'spot';
  const metric: ScreenerMetricKey = 'changePct';

  assert.equal(marketType, 'spot');
  assert.equal(metric, 'changePct');
  assert.equal(SCREENER_REFRESH_INTERVAL_MS, 5000);
  assert.deepEqual(Array.from(SCREENER_DEFAULT_EXCHANGES), ['binance', 'bybit', 'okx', 'mexc']);
});
