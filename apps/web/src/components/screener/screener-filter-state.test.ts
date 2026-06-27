import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCREENER_DEFAULT_EXCHANGES,
  SCREENER_METRIC_KEYS,
  SCREENER_REFRESH_INTERVAL_MS,
  SCREENER_TIMEFRAME_METRIC_KEYS,
} from '@crypto-screener/shared';
import type { ScreenerMarketType, ScreenerMetricKey } from '@crypto-screener/shared';

test('shared screener contracts export market mode and metric keys', () => {
  const marketType: ScreenerMarketType = 'spot';
  const metric: ScreenerMetricKey = 'changePct';

  assert.equal(marketType, 'spot');
  assert.equal(metric, 'changePct');
  assert.equal(SCREENER_REFRESH_INTERVAL_MS, 5000);
  assert.deepEqual(Array.from(SCREENER_DEFAULT_EXCHANGES), ['binance', 'bybit', 'okx', 'mexc']);
  assert.ok(SCREENER_METRIC_KEYS.includes('spreadPct'));
  assert.ok(SCREENER_METRIC_KEYS.includes('price'));
  assert.ok(SCREENER_TIMEFRAME_METRIC_KEYS.includes('changePct'));
  assert.ok(!SCREENER_TIMEFRAME_METRIC_KEYS.includes('spreadPct'));
});
