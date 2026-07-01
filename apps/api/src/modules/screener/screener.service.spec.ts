import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScreenerSnapshotRow } from './screener.metrics.ts';

test('buildScreenerSnapshotRow derives current and timeframe metrics from market inputs', () => {
  const row = buildScreenerSnapshotRow({
    ticker: {
      exchange: 'binance',
      marketType: 'futures',
      symbol: 'BTC/USDT:USDT',
      lastPrice: 64000,
      volume24h: 120000000,
      priceChangePercent24h: 3.2,
      priceChange24h: 1984,
      high24h: 65000,
      low24h: 61000,
      timestamp: Date.now(),
    },
    featureMap: {
      '1m.changePct': 0.8,
      '1m.trades': 500,
      '1m.turnover': 1200000,
      '1m.volumeSpikePct': 180,
    },
  });

  assert.equal(row.exchange, 'binance');
  assert.equal(row.marketType, 'futures');
  assert.equal(row.price, 64000);
  assert.equal(row.metrics['1m.changePct'], 0.8);
  assert.equal(row.metrics['1m.volumeSpikePct'], 180);
});
