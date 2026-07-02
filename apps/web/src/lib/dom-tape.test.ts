import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDomViewModel, buildTapeRows, findPairedMarket } from './dom-tape.ts';

test('buildDomViewModel aggregates levels into visible rows and marks anomalies', () => {
  const view = buildDomViewModel({
    orderbook: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
      asks: [
        { price: 101, quantity: 1 },
        { price: 102, quantity: 5 },
      ],
      bids: [
        { price: 99, quantity: 1 },
        { price: 98, quantity: 50 },
        { price: 97, quantity: 1 },
      ],
    },
    compressionPct: 0.05,
    rowsPerSide: 6,
  });

  assert.ok(view);
  assert.equal(view.midPrice, 100);
  assert.ok(view.asks.length > 0);
  assert.ok(view.bids.length > 0);
  assert.ok(view.bids.some(level => level.isAnomalous));
});

test('buildTapeRows filters by usd threshold and highlights large prints', () => {
  const rows = buildTapeRows({
    trades: [
      { id: '1', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 10, side: 'buy', timestamp: 2 },
      { id: '2', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 1, side: 'sell', timestamp: 1 },
    ],
    minSizeUsd: 500,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, '1');
  assert.equal(rows[0]?.isLargePrint, true);
});

test('findPairedMarket resolves spot and futures counterpart when ticker exists', () => {
  const hasTicker = (symbol: string, marketType: 'spot' | 'futures') =>
    symbol === 'BTC/USDT' && marketType === 'spot';

  const paired = findPairedMarket({
    symbol: 'BTC/USDT:USDT',
    marketType: 'futures',
    hasTicker,
  });

  assert.deepEqual(paired, { marketType: 'spot', symbol: 'BTC/USDT' });
});
