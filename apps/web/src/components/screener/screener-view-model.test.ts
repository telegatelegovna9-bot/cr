import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDisplayRows } from './screener-view-model.ts';

test('buildDisplayRows filters and sorts snapshot rows for the table', () => {
  const rows = buildDisplayRows({
    snapshot: {
      marketType: 'spot',
      updatedAt: 1,
      rows: [
        {
          symbol: 'ETH/USDT',
          exchange: 'binance',
          marketType: 'spot',
          price: 3200,
          spreadPct: 0.02,
          fundingPct: null,
          oi: null,
          updatedAt: 5,
          metrics: { '1m.changePct': 2.4, '1m.volumeSpikePct': 120, '1m.tradesSpikePct': 80 },
        },
        {
          symbol: 'BTC/USDT',
          exchange: 'binance',
          marketType: 'spot',
          price: 64000,
          spreadPct: 0.02,
          fundingPct: null,
          oi: null,
          updatedAt: 1,
          metrics: { '1m.changePct': 2.5, '1m.volumeSpikePct': 400, '1m.tradesSpikePct': 200 },
        },
      ],
    },
    filters: { exchanges: ['binance'], metrics: { changePct: { timeframe: '1m', min: 2 } } },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.symbol, 'BTC/USDT');
});
