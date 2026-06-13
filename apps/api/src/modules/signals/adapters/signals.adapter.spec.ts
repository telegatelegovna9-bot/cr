import assert from 'node:assert/strict';
import { normalizeBinanceAggTrade } from './binance.adapter';

const event = normalizeBinanceAggTrade({
  s: 'BTCUSDT',
  p: '100000',
  q: '2',
  m: false,
  T: 1710000000000,
});

assert.equal(event.exchange, 'binance');
assert.equal(event.usdValue, 200000);
assert.equal(event.side, 'buy');
console.log('Signals adapter tests passed!');
