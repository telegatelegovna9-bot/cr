import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCREENER_DEFAULT_EXCHANGES,
  SCREENER_METRIC_KEYS,
  SCREENER_REFRESH_INTERVAL_MS,
  SCREENER_TIMEFRAME_METRIC_KEYS,
} from '@crypto-screener/shared';
import { rowMatchesFilters } from './screener-filter-state.ts';
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

test('rowMatchesFilters applies min and max metric bounds', () => {
  const matched = rowMatchesFilters(
    {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      marketType: 'spot',
      metrics: { '1m.changePct': 2.1 },
      spreadPct: 0.03,
      fundingPct: 0.01,
      oi: 1000,
      price: 120,
      updatedAt: 1,
    },
    {
      exchanges: ['binance'],
      metrics: {
        changePct: { timeframe: '1m', min: 1.5, max: 3 },
      },
    },
  );

  assert.equal(matched, true);
});
