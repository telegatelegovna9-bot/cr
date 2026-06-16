import assert from 'node:assert/strict';
import type { Ticker } from '@crypto-screener/shared';
import { ScreenerStore } from './screener.store';

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

  console.log('ScreenerEngine feature-layer tests passed!');
}

runTest().catch(err => {
  console.error('ScreenerEngine feature-layer tests failed:', err);
  process.exit(1);
});
