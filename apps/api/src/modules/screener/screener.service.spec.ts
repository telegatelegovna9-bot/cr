import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScreenerSnapshotRow } from './screener.metrics';
import { ScreenerService } from './screener.service';

test('buildScreenerSnapshotRow derives current and timeframe metrics from market inputs', () => {
  const featureMap = {
    '1m.changePct': 0.8,
    '1m.trades': 500,
    '1m.turnover': 1200000,
    '1m.volumeSpikePct': 180,
  } as const;

  const row = buildScreenerSnapshotRow({
    ticker: {
      exchange: 'binance',
      marketType: 'futures',
      symbol: 'BTC/USDT:USDT',
      lastPrice: 64000,
      volume24h: 120000000,
      priceChangePercent24h: 3.2,
      timestamp: Date.now(),
    },
    featureMap,
  });

  assert.equal(row.exchange, 'binance');
  assert.equal(row.marketType, 'futures');
  assert.equal(row.price, 64000);
  assert.equal(row.metrics['1m.changePct'], 0.8);
  assert.equal(row.metrics['1m.volumeSpikePct'], 180);
  assert.notEqual(row.metrics, featureMap);
});

test('ScreenerService snapshots are market-scoped and detached from caller mutations', () => {
  const service = new ScreenerService();
  const rows = [
    {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      marketType: 'spot',
      price: 64000,
      spreadPct: 0.02,
      fundingPct: null,
      oi: null,
      updatedAt: 1,
      metrics: { '1m.changePct': 0.6 },
    },
    {
      symbol: 'BTC/USDT:USDT',
      exchange: 'binance',
      marketType: 'futures',
      price: 64100,
      spreadPct: 0.03,
      fundingPct: 0.01,
      oi: 1000,
      updatedAt: 2,
      metrics: { '1m.changePct': 0.9 },
    },
  ] as const;

  service.updateSnapshot('spot', [...rows]);

  const firstRead = service.listSnapshot('spot');
  assert.equal(firstRead.marketType, 'spot');
  assert.equal(firstRead.rows.length, 1);
  assert.equal(firstRead.rows[0]?.symbol, 'BTC/USDT');

  firstRead.rows[0]!.price = 1;
  firstRead.rows[0]!.metrics['1m.changePct'] = 9;

  const secondRead = service.listSnapshot('spot');
  assert.equal(secondRead.rows[0]?.price, 64000);
  assert.equal(secondRead.rows[0]?.metrics['1m.changePct'], 0.6);
  assert.notEqual(secondRead.rows[0], rows[0]);
  assert.notEqual(secondRead.rows[0]?.metrics, rows[0].metrics);
});

test('ScreenerService refreshFromMarketRows keeps spot and futures snapshots separated', () => {
  const service = new ScreenerService();

  service.refreshFromMarketRows([
    {
      symbol: 'ETH/USDT',
      exchange: 'binance',
      marketType: 'spot',
      price: 3500,
      spreadPct: 0.02,
      fundingPct: null,
      oi: null,
      updatedAt: 1,
      metrics: { '1m.changePct': 0.6 },
    },
    {
      symbol: 'ETH/USDT:USDT',
      exchange: 'bybit',
      marketType: 'futures',
      price: 3510,
      spreadPct: 0.03,
      fundingPct: 0.01,
      oi: 2000,
      updatedAt: 2,
      metrics: { '1m.changePct': 0.8 },
    },
  ]);

  const spotSnapshot = service.listSnapshot('spot');
  const futuresSnapshot = service.listSnapshot('futures');

  assert.equal(spotSnapshot.marketType, 'spot');
  assert.equal(spotSnapshot.rows.length, 1);
  assert.equal(spotSnapshot.rows[0]?.marketType, 'spot');
  assert.equal(spotSnapshot.rows[0]?.symbol, 'ETH/USDT');

  assert.equal(futuresSnapshot.marketType, 'futures');
  assert.equal(futuresSnapshot.rows.length, 1);
  assert.equal(futuresSnapshot.rows[0]?.marketType, 'futures');
  assert.equal(futuresSnapshot.rows[0]?.symbol, 'ETH/USDT:USDT');
});
