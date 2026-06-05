import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatDisplaySymbol,
  getDisplayBaseSymbol,
  formatMarketTypeLabel,
} from './display-symbol.ts';

test('formatDisplaySymbol hides futures transport suffixes from users', () => {
  assert.equal(formatDisplaySymbol('BTC/USDT:USDT'), 'BTC/USDT');
  assert.equal(formatDisplaySymbol('ETH/USDT'), 'ETH/USDT');
  assert.equal(formatDisplaySymbol('SOL/USDT:PERP'), 'SOL/USDT');
});

test('getDisplayBaseSymbol returns the asset ticker from the display symbol', () => {
  assert.equal(getDisplayBaseSymbol('BTC/USDT:USDT'), 'BTC');
  assert.equal(getDisplayBaseSymbol('DOGE/USDT'), 'DOGE');
});

test('formatMarketTypeLabel returns stable user-facing labels', () => {
  assert.equal(formatMarketTypeLabel('spot'), 'Spot');
  assert.equal(formatMarketTypeLabel('futures'), 'Futures');
});
