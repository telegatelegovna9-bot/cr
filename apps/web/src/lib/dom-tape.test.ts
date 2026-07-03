import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBubbleTapeItems,
  buildDomViewModel,
  buildTapeRows,
  findPairedMarket,
  trimBubbleTapeItems,
} from './dom-tape.ts';

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

test('buildDomViewModel respects manual anchor price when deriving visible ladder rows', () => {
  const view = buildDomViewModel({
    orderbook: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
      asks: [
        { price: 101, quantity: 1 },
        { price: 102, quantity: 1 },
        { price: 103, quantity: 1 },
        { price: 104, quantity: 1 },
      ],
      bids: [
        { price: 99, quantity: 1 },
        { price: 98, quantity: 1 },
        { price: 97, quantity: 1 },
        { price: 96, quantity: 1 },
      ],
    },
    compressionPct: 0.05,
    anchorPrice: 103,
    rowsPerSide: 2,
  });

  assert.ok(view);
  assert.deepEqual(
    view.asks.map(level => level.price),
    [104, 103],
  );
  assert.deepEqual(
    view.bids.map(level => level.price),
    [103, 102],
  );
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

test('buildTapeRows returns newest trades first without mutating append-ordered input', () => {
  const trades = [
    { id: '1', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 1, side: 'buy', timestamp: 1 },
    { id: '2', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 2, side: 'sell', timestamp: 2 },
    { id: '3', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 3, side: 'buy', timestamp: 3 },
  ] as const;

  const rows = buildTapeRows({ trades: [...trades] });

  assert.deepEqual(
    rows.map(row => row.id),
    ['3', '2', '1'],
  );
  assert.deepEqual(
    trades.map(trade => trade.id),
    ['1', '2', '3'],
  );
});

test('buildBubbleTapeItems preserves trade order and marks large prints from real trade size', () => {
  const items = buildBubbleTapeItems({
    trades: [
      { id: '1', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 1, side: 'buy', timestamp: 10 },
      { id: '2', exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT', price: 100, quantity: 20, side: 'sell', timestamp: 20 },
    ],
    minLargePrintUsd: 1_000,
    now: 50,
  });

  assert.deepEqual(items.map(item => item.id), ['1', '2']);
  assert.equal(items[0]?.sizeUsd, 100);
  assert.equal(items[0]?.isLargePrint, false);
  assert.equal(items[1]?.sizeUsd, 2_000);
  assert.equal(items[1]?.isLargePrint, true);
});

test('trimBubbleTapeItems keeps latest visible bubbles and drops expired items', () => {
  const items = trimBubbleTapeItems({
    items: [
      {
        id: 'old',
        tradeId: 'old',
        price: 100,
        side: 'buy',
        sizeUsd: 500,
        sizeCoin: 5,
        timestamp: 1,
        createdAt: 1,
        ageMs: 5_000,
        intensity: 0.3,
        isLargePrint: false,
      },
      {
        id: 'keep-1',
        tradeId: 'keep-1',
        price: 101,
        side: 'sell',
        sizeUsd: 1_000,
        sizeCoin: 10,
        timestamp: 2,
        createdAt: 1_500,
        ageMs: 100,
        intensity: 0.5,
        isLargePrint: false,
      },
      {
        id: 'keep-2',
        tradeId: 'keep-2',
        price: 102,
        side: 'buy',
        sizeUsd: 2_000,
        sizeCoin: 20,
        timestamp: 3,
        createdAt: 1_900,
        ageMs: 50,
        intensity: 1,
        isLargePrint: true,
      },
    ],
    now: 2_000,
    maxItems: 1,
    ttlMs: 1_000,
  });

  assert.deepEqual(items.map(item => item.id), ['keep-2']);
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
