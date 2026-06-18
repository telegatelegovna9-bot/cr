import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findPreferredOrderbook,
  getOrderbookMapKey,
} from './orderbook-identity.ts';

test('keys orderbook snapshots by exchange, market type, and symbol', () => {
  assert.equal(
    getOrderbookMapKey('binance', 'spot', 'BTC/USDT'),
    'binance:spot:BTC/USDT',
  );
  assert.equal(
    getOrderbookMapKey('binance', 'futures', 'BTC/USDT'),
    'binance:futures:BTC/USDT',
  );
});

test('futures heatmap lookup degrades to matching exchange and symbol when only spot-tagged snapshot exists', () => {
  const books = new Map([
    ['binance:spot:BTC/USDT', { exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT' }],
  ]);

  const snapshot = findPreferredOrderbook(books, 'binance', 'futures', ['BTC/USDT']);

  assert.deepEqual(snapshot, {
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
  });
});

test('futures heatmap lookup resolves the futures snapshot when present', () => {
  const books = new Map([
    ['binance:spot:BTC/USDT', { exchange: 'binance', marketType: 'spot', symbol: 'BTC/USDT' }],
    ['binance:futures:BTC/USDT', { exchange: 'binance', marketType: 'futures', symbol: 'BTC/USDT' }],
  ]);

  const snapshot = findPreferredOrderbook(books, 'binance', 'futures', ['BTC/USDT']);

  assert.deepEqual(snapshot, {
    exchange: 'binance',
    marketType: 'futures',
    symbol: 'BTC/USDT',
  });
});

test('futures heatmap lookup falls back to matching symbol on same exchange when keyed snapshot format differs', () => {
  const books = new Map([
    ['legacy-key', { exchange: 'binance', marketType: 'futures', symbol: 'BTC/USDT:USDT' }],
  ]);

  const snapshot = findPreferredOrderbook(books, 'binance', 'futures', ['BTC/USDT:USDT', 'BTC/USDT']);

  assert.deepEqual(snapshot, {
    exchange: 'binance',
    marketType: 'futures',
    symbol: 'BTC/USDT:USDT',
  });
});

test('futures heatmap lookup degrades to same exchange and symbol even when market type metadata is missing', () => {
  const books = new Map([
    ['legacy-key', { exchange: 'binance', symbol: 'BTC/USDT:USDT' }],
  ]);

  const snapshot = findPreferredOrderbook(books, 'binance', 'futures', ['BTC/USDT:USDT']);

  assert.deepEqual(snapshot, {
    exchange: 'binance',
    symbol: 'BTC/USDT:USDT',
  });
});
