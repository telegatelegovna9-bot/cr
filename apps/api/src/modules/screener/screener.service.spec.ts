import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScreenerSnapshotRow } from './screener.metrics';
import { ScreenerService } from './screener.service';

function createService(tickers: any[] = []) {
  return new ScreenerService({
    getAllTickerValues: () => tickers,
  } as never);
}

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
  const service = createService();
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
  const service = createService();

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

test('ScreenerService listSnapshot hydrates rows from MarketService ticker cache', () => {
  const service = createService([
    {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      lastPrice: 64000,
      priceChange24h: 0,
      priceChangePercent24h: 2.5,
      volume24h: 120000000,
      high24h: 65000,
      low24h: 61000,
      timestamp: 1710000000000,
      volatility: 0,
      atr: 0,
    },
    {
      exchange: 'bybit',
      marketType: 'futures',
      symbol: 'ETH/USDT:USDT',
      lastPrice: 3500,
      priceChange24h: 0,
      priceChangePercent24h: 1.1,
      volume24h: 99000000,
      high24h: 3550,
      low24h: 3400,
      timestamp: 1710000005000,
      volatility: 0,
      atr: 0,
    },
  ]);

  const spotSnapshot = service.listSnapshot('spot');
  const futuresSnapshot = service.listSnapshot('futures');

  assert.equal(spotSnapshot.rows.length, 1);
  assert.equal(spotSnapshot.rows[0]?.symbol, 'BTC/USDT');
  assert.equal(spotSnapshot.rows[0]?.price, 64000);
  assert.equal(spotSnapshot.rows[0]?.metrics['1m.natrPct'], 6.25);
  assert.equal(spotSnapshot.updatedAt, 1710000000000);

  assert.equal(futuresSnapshot.rows.length, 1);
  assert.equal(futuresSnapshot.rows[0]?.symbol, 'ETH/USDT:USDT');
  assert.equal(futuresSnapshot.rows[0]?.price, 3500);
  assert.equal(futuresSnapshot.updatedAt, 1710000005000);
});

test('ScreenerService derives rolling 1m metrics from ticker history', () => {
  const baseTicker = {
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    priceChange24h: 0,
    priceChangePercent24h: 2.5,
    volatility: 0,
    atr: 0,
    bid: 64990,
    ask: 65010,
    high24h: 65600,
    low24h: 64000,
  };
  const tickers = [
    {
      ...baseTicker,
      lastPrice: 64000,
      volume24h: 1000,
      quoteVolume24h: 64000000,
      trades24h: 100,
      timestamp: 1710000000000,
    },
    {
      ...baseTicker,
      lastPrice: 64100,
      volume24h: 1010,
      quoteVolume24h: 64741000,
      trades24h: 102,
      timestamp: 1710000015000,
    },
    {
      ...baseTicker,
      lastPrice: 64200,
      volume24h: 1021,
      quoteVolume24h: 65562000,
      trades24h: 105,
      timestamp: 1710000030000,
    },
    {
      ...baseTicker,
      lastPrice: 64300,
      volume24h: 1033,
      quoteVolume24h: 66419000,
      trades24h: 109,
      timestamp: 1710000045000,
    },
    {
      ...baseTicker,
      lastPrice: 65000,
      volume24h: 1088,
      quoteVolume24h: 70720000,
      trades24h: 130,
      timestamp: 1710000060000,
    },
  ];
  let currentTickers = [tickers[0]];
  const service = new ScreenerService({
    getAllTickerValues: () => currentTickers,
  } as never);

  for (const ticker of tickers) {
    currentTickers = [ticker];
    service.refreshSnapshotsFromMarketCache();
  }

  const snapshot = service.listSnapshot('spot');
  const row = snapshot.rows[0];

  assert.ok(row);
  assert.equal(row.symbol, 'BTC/USDT');
  assert.equal(row.metrics['1m.changePct']?.toFixed(4), '1.5625');
  assert.equal(row.metrics['1m.trades'], 30);
  assert.equal(row.metrics['1m.turnover'], 6720000);
  assert.equal(row.metrics['1m.deltaVolume'], 88);
  assert.equal(row.metrics['1m.deltaVolumePct'], 800);
  assert.equal(row.metrics['1m.volumeSpikePct'], 700);
  assert.equal(row.metrics['1m.tradesSpikePct'], 900);
});

test('ScreenerService listSnapshot does not overwrite existing rows and metrics during bootstrap reads', () => {
  const service = createService([
    {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      lastPrice: 64010,
      priceChange24h: 0,
      priceChangePercent24h: 2.5,
      volume24h: 120000000,
      high24h: 65000,
      low24h: 61000,
      timestamp: 1710000009999,
      volatility: 0,
      atr: 0,
    },
  ]);

  service.updateSnapshot('spot', [
    {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      marketType: 'spot',
      price: 64000,
      spreadPct: 0.02,
      fundingPct: null,
      oi: null,
      updatedAt: 1710000001000,
      metrics: { '1m.changePct': 1.4, '1m.volumeSpikePct': 170 },
    },
  ]);

  const snapshot = service.listSnapshot('spot');

  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0]?.price, 64000);
  assert.equal(snapshot.rows[0]?.metrics['1m.changePct'], 1.4);
  assert.equal(snapshot.rows[0]?.metrics['1m.volumeSpikePct'], 170);
  assert.equal(snapshot.updatedAt, 1710000001000);
});

test('ScreenerService listSnapshot does not bump updatedAt just because it was called', () => {
  const service = createService([
    {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      lastPrice: 64000,
      priceChange24h: 0,
      priceChangePercent24h: 2.5,
      volume24h: 120000000,
      high24h: 65000,
      low24h: 61000,
      timestamp: 1710000000000,
      volatility: 0,
      atr: 0,
    },
  ]);

  const first = service.listSnapshot('spot');
  const second = service.listSnapshot('spot');

  assert.equal(first.updatedAt, 1710000000000);
  assert.equal(second.updatedAt, 1710000000000);
});
