import assert from 'node:assert/strict';
import type { ScreenerEvent, Ticker } from '@crypto-screener/shared';
import { SpotBreakoutPressureDetector } from './detectors/spot-breakout-pressure.detector';
import { ScreenerEngine } from './screener.engine';
import { ScreenerStore } from './screener.store';
import type { ScreenerRow } from './screener.types';

interface EventSnapshot {
  bestSetups: ScreenerEvent[];
  spotEvents: ScreenerEvent[];
  futuresEvents: ScreenerEvent[];
  rows: ScreenerRow[];
}

function makeTicker(overrides: Partial<Ticker>): Ticker {
  return {
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    lastPrice: 100,
    priceChange24h: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    timestamp: 0,
    quoteVolume24h: 0,
    ...overrides,
  };
}

function makeEngineWithBreakoutFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 1_000_000;
  const symbol = 'BTC/USDT';

  const series = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 102_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 99.9, quoteVolume24h: 104_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.1, quoteVolume24h: 106_000 },
    { timestamp: now - 90_000, lastPrice: 104.5, quoteVolume24h: 112_000 },
    { timestamp: now - 45_000, lastPrice: 104.8, quoteVolume24h: 120_000 },
    { timestamp: now, lastPrice: 105.0, quoteVolume24h: 130_000 },
  ];

  for (const sample of series) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  return { engine, now };
}

function makeEngineWithCoexistingSpotDetectorsFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 1_000_000;
  const symbol = 'BTC/USDT';

  const binanceSeries = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 102_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 99.9, quoteVolume24h: 104_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.1, quoteVolume24h: 106_000 },
    { timestamp: now - 90_000, lastPrice: 104.5, quoteVolume24h: 112_000 },
    { timestamp: now - 45_000, lastPrice: 104.8, quoteVolume24h: 120_000 },
    { timestamp: now, lastPrice: 105.0, quoteVolume24h: 130_000 },
  ];
  const okxSeries = [
    { timestamp: now - 60_000, lastPrice: 102.8, quoteVolume24h: 80_000 },
    { timestamp: now - 30_000, lastPrice: 103.0, quoteVolume24h: 84_000 },
  ];
  const bybitSeries = [
    { timestamp: now - 60_000, lastPrice: 104.4, quoteVolume24h: 75_000 },
    { timestamp: now, lastPrice: 104.4, quoteVolume24h: 78_000 },
  ];

  for (const sample of binanceSeries) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  for (const sample of okxSeries) {
    store.recordTicker(
      makeTicker({
        exchange: 'okx',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  for (const sample of bybitSeries) {
    store.recordTicker(
      makeTicker({
        exchange: 'bybit',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  return { engine, now };
}

function makeEngineWithFuturesFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 2_000_000;
  const symbol = 'BTC/USDT:USDT';

  const series = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 103_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 100.5, quoteVolume24h: 106_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.8, quoteVolume24h: 109_000 },
    { timestamp: now - 90_000, lastPrice: 101.3, quoteVolume24h: 112_000 },
    { timestamp: now - 45_000, lastPrice: 101.7, quoteVolume24h: 120_000 },
    { timestamp: now, lastPrice: 102.2, quoteVolume24h: 130_000 },
  ];

  for (const sample of series) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  store.recordOpenInterest('binance', symbol, 1_000, now - 5 * 60_000);
  store.recordOpenInterest('binance', symbol, 1_070, now);
  store.recordTakerBuyRatio('binance', symbol, 1.2, now);

  return { engine, now };
}

function makeEngineWithFutureLeakFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 3_000_000;
  const symbol = 'ETH/USDT';

  const historicalSeries = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 102_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 99.9, quoteVolume24h: 104_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.1, quoteVolume24h: 106_000 },
    { timestamp: now - 90_000, lastPrice: 100.0, quoteVolume24h: 108_000 },
    { timestamp: now - 45_000, lastPrice: 100.2, quoteVolume24h: 110_000 },
    { timestamp: now, lastPrice: 100.1, quoteVolume24h: 112_000 },
  ];
  const futureSpike = { timestamp: now + 60_000, lastPrice: 106.0, quoteVolume24h: 130_000 };

  for (const sample of historicalSeries) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  store.recordTicker(
    makeTicker({
      exchange: 'binance',
      marketType: 'spot',
      symbol,
      lastPrice: futureSpike.lastPrice,
      quoteVolume24h: futureSpike.quoteVolume24h,
    }),
    futureSpike.timestamp,
  );

  return { engine, now };
}

function makeEngineWithStaleCrossExchangeFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 4_000_000;
  const symbol = 'SOL/USDT';

  store.recordTicker(makeTicker({
    exchange: 'binance',
    marketType: 'spot',
    symbol,
    lastPrice: 100,
    quoteVolume24h: 100_000,
  }), now);
  store.recordTicker(makeTicker({
    exchange: 'bybit',
    marketType: 'spot',
    symbol,
    lastPrice: 100.2,
    quoteVolume24h: 101_000,
  }), now - 15_000);
  store.recordTicker(makeTicker({
    exchange: 'okx',
    marketType: 'spot',
    symbol,
    lastPrice: 104,
    quoteVolume24h: 95_000,
  }), now - 3 * 60_000);

  return { engine, now };
}

function makeEngineWithSparseHistoryFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 5_000_000;
  const symbol = 'XRP/USDT';

  store.recordTicker(makeTicker({
    exchange: 'binance',
    marketType: 'spot',
    symbol,
    lastPrice: 100,
    quoteVolume24h: 100_000,
  }), now - 10 * 60_000);
  store.recordTicker(makeTicker({
    exchange: 'binance',
    marketType: 'spot',
    symbol,
    lastPrice: 106,
    quoteVolume24h: 101_000,
  }), now);

  return { engine, now };
}

function makeEngineWithFuturesSqueezeFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 6_000_000;
  const symbol = 'ETH/USDT:USDT';

  const series = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 103_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 100.3, quoteVolume24h: 106_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.4, quoteVolume24h: 109_000 },
    { timestamp: now - 90_000, lastPrice: 103.8, quoteVolume24h: 112_000 },
    { timestamp: now - 45_000, lastPrice: 104.6, quoteVolume24h: 120_000 },
    { timestamp: now, lastPrice: 105.5, quoteVolume24h: 132_000 },
  ];

  for (const sample of series) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  store.recordOpenInterest('binance', symbol, 1_000, now - 5 * 60_000);
  store.recordOpenInterest('binance', symbol, 960, now);
  store.recordTakerBuyRatio('binance', symbol, 1.5, now);

  return { engine, now };
}

function makeEngineWithStaleFuturesContextFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 7_000_000;
  const symbol = 'SOL/USDT:USDT';

  const series = [
    { timestamp: now - 6 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 100.2, quoteVolume24h: 103_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 100.5, quoteVolume24h: 106_000 },
    { timestamp: now - 3 * 60_000, lastPrice: 100.8, quoteVolume24h: 109_000 },
    { timestamp: now - 90_000, lastPrice: 101.3, quoteVolume24h: 112_000 },
    { timestamp: now - 45_000, lastPrice: 101.7, quoteVolume24h: 120_000 },
    { timestamp: now, lastPrice: 102.2, quoteVolume24h: 130_000 },
  ];

  for (const sample of series) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'futures',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  store.recordOpenInterest('binance', symbol, 1_000, now - 7 * 60_000);
  store.recordOpenInterest('binance', symbol, 1_070, now - 2 * 60_000);
  store.recordTakerBuyRatio('binance', symbol, 1.45, now - 2 * 60_000);

  return { engine, now };
}

function makeEngineWithStalePrimaryFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 8_000_000;
  const symbol = 'ADA/USDT';

  const series = [
    { timestamp: now - 7 * 60_000, lastPrice: 100.0, quoteVolume24h: 100_000 },
    { timestamp: now - 6 * 60_000, lastPrice: 100.2, quoteVolume24h: 102_000 },
    { timestamp: now - 5 * 60_000, lastPrice: 99.9, quoteVolume24h: 104_000 },
    { timestamp: now - 4 * 60_000, lastPrice: 100.1, quoteVolume24h: 106_000 },
    { timestamp: now - 150_000, lastPrice: 104.5, quoteVolume24h: 112_000 },
    { timestamp: now - 105_000, lastPrice: 104.8, quoteVolume24h: 120_000 },
    { timestamp: now - 60_000, lastPrice: 105.0, quoteVolume24h: 130_000 },
  ];

  for (const sample of series) {
    store.recordTicker(
      makeTicker({
        exchange: 'binance',
        marketType: 'spot',
        symbol,
        lastPrice: sample.lastPrice,
        quoteVolume24h: sample.quoteVolume24h,
      }),
      sample.timestamp,
    );
  }

  return { engine, now };
}

function makeEngineWithStaleSecondaryRelativeToNowFixture() {
  const store = new ScreenerStore();
  const engine = new ScreenerEngine(store);
  const now = 9_000_000;
  const symbol = 'DOGE/USDT';

  store.recordTicker(makeTicker({
    exchange: 'binance',
    marketType: 'spot',
    symbol,
    lastPrice: 100,
    quoteVolume24h: 100_000,
  }), now - 40_000);
  store.recordTicker(makeTicker({
    exchange: 'bybit',
    marketType: 'spot',
    symbol,
    lastPrice: 104,
    quoteVolume24h: 101_000,
  }), now - 50_000);

  return { engine, now };
}

async function runTest() {
  {
    const store = new ScreenerStore();

    store.recordTicker(makeTicker({ exchange: 'binance', symbol: 'SOL/USDT', lastPrice: 100, marketType: 'spot' }), 1_000);
    store.recordTicker(makeTicker({ exchange: 'okx', symbol: 'SOL/USDT', lastPrice: 102, marketType: 'spot' }), 1_000);

    const deviation = store.getRelativePriceDeviation('SOL/USDT', 'spot');
    const binance = deviation.byExchange.find(item => item.exchange === 'binance');

    assert.equal(deviation.medianPrice, 101);
    assert.ok(binance);
    assert.ok(Math.abs(binance.deviationBps - (-99.00990099009901)) < 1e-9);
  }

  {
    const store = new ScreenerStore();

    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'ETH/USDT',
      lastPrice: 2000,
      marketType: 'spot',
      quoteVolume24h: 20_000,
    }), 2_000);
    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'ETH/USDT',
      lastPrice: 1990,
      marketType: 'spot',
      quoteVolume24h: 10_000,
    }), 1_500);

    assert.equal(store.getRollingQuoteVolumeDelta('binance', 'ETH/USDT', 'spot', 1_000), 0);
  }

  {
    const store = new ScreenerStore();

    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      lastPrice: 101,
      marketType: 'spot',
      quoteVolume24h: 30_000,
    }), 2_000);
    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      lastPrice: 99,
      marketType: 'spot',
      quoteVolume24h: 20_000,
    }), 1_000);

    assert.equal(store.getRollingQuoteVolumeDelta('binance', 'BTC/USDT', 'spot', 1_000), 10_000);
    assert.equal(store.getLatestTickersForSymbol('BTC/USDT', 'spot')[0]?.lastPrice, 101);
  }

  {
    const store = new ScreenerStore();

    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'XRP/USDT',
      lastPrice: 1,
      marketType: 'spot',
    }), 0);

    assert.equal(store.getHealth(1).sources.binance.status, 'live');
  }

  {
    const store = new ScreenerStore();

    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'ADA/USDT',
      lastPrice: 1,
      marketType: 'spot',
    }), 2_000);
    store.recordTicker(makeTicker({
      exchange: 'binance',
      symbol: 'ADA/USDT',
      lastPrice: 0.99,
      marketType: 'spot',
    }), 1_000);

    assert.equal(store.getHealth(2_001).sources.binance.lastSeenAt, 2_000);
  }

  {
    const event = new SpotBreakoutPressureDetector().detect({
      symbol: 'BTC/USDT',
      primaryExchange: 'binance',
      lastPrice: 95,
      updatedAt: 1_000,
      priceChange5m: -5.2,
      volumeSpikeRatio: 3.8,
      volumeNow: 25_000,
      compressionPct: 1.2,
      breakoutRetentionMs: 90_000,
      breakoutDirection: 'down',
      breakoutReferencePrice: 99,
    })[0];

    assert.equal(event?.invalidates[0], 'Price closes back above the breakdown level.');
  }

  {
    const { engine, now } = makeEngineWithBreakoutFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.bestSetups?.[0]?.detectorType, 'spot-breakout-pressure');
    assert.equal(snapshot.bestSetups?.[0]?.promotionTier, 'rare');
  }

  {
    const { engine, now } = makeEngineWithCoexistingSpotDetectorsFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.deepEqual(
      snapshot.spotEvents
        .filter(event => event.symbol === 'BTC/USDT')
        .map(event => event.detectorType)
        .sort(),
      ['spot-breakout-pressure', 'spot-cross-exchange'],
    );
    assert.deepEqual(
      snapshot.bestSetups
        .filter(event => event.symbol === 'BTC/USDT')
        .map(event => event.detectorType)
        .sort(),
      ['spot-breakout-pressure', 'spot-cross-exchange'],
    );
    assert.equal(
      snapshot.spotEvents.find(event => event.detectorType === 'spot-cross-exchange')?.updatedAt,
      now - 30_000,
    );
  }

  {
    const { engine, now } = makeEngineWithFuturesFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.futuresEvents[0]?.detectorType, 'futures-oi-build');
    assert.equal(snapshot.futuresEvents[0]?.symbol, 'BTC/USDT:USDT');
  }

  {
    const { engine, now } = makeEngineWithFutureLeakFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.bestSetups.some(event => event.symbol === 'ETH/USDT'), false);
    assert.equal(snapshot.spotEvents.some(event => event.symbol === 'ETH/USDT'), false);
    assert.equal(snapshot.rows.some(row => row.symbol === 'ETH/USDT' && row.updatedAt > now), false);
  }

  {
    const { engine, now } = makeEngineWithStaleCrossExchangeFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(
      snapshot.spotEvents.some(
        event => event.symbol === 'SOL/USDT' && event.detectorType === 'spot-cross-exchange',
      ),
      false,
    );
  }

  {
    const { engine, now } = makeEngineWithSparseHistoryFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.rows.some(row => row.symbol === 'XRP/USDT'), false);
    assert.equal(snapshot.bestSetups.some(event => event.symbol === 'XRP/USDT'), false);
  }

  {
    const { engine, now } = makeEngineWithFuturesSqueezeFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(
      snapshot.futuresEvents.some(
        event => event.symbol === 'ETH/USDT:USDT' && event.detectorType === 'futures-squeeze-risk',
      ),
      true,
    );
  }

  {
    const { engine, now } = makeEngineWithStaleFuturesContextFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.futuresEvents.some(event => event.symbol === 'SOL/USDT:USDT'), false);
  }

  {
    const { engine, now } = makeEngineWithStalePrimaryFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(snapshot.rows.some(row => row.symbol === 'ADA/USDT'), false);
    assert.equal(snapshot.spotEvents.some(event => event.symbol === 'ADA/USDT'), false);
    assert.equal(snapshot.bestSetups.some(event => event.symbol === 'ADA/USDT'), false);
  }

  {
    const { engine, now } = makeEngineWithStaleSecondaryRelativeToNowFixture();
    const snapshot = engine.build(now) as unknown as EventSnapshot;

    assert.equal(
      snapshot.spotEvents.some(
        event => event.symbol === 'DOGE/USDT' && event.detectorType === 'spot-cross-exchange',
      ),
      false,
    );
  }

  console.log('ScreenerEngine feature-layer tests passed!');
}

runTest().catch(err => {
  console.error('ScreenerEngine feature-layer tests failed:', err);
  process.exit(1);
});
