import assert from 'node:assert/strict';
import { SignalsStore } from './signals.store';

const store = new SignalsStore();
const now = Date.now();

store.upsertSignal({
  id: 'old',
  timestamp: now - 20 * 60 * 1000,
  exchange: 'binance',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  side: 'buy',
  eventType: 'large_buy',
  usdValue: 150000,
  tradeCount: 1,
  price: 100000,
  confidenceScore: 0.6,
  priorityScore: 0.6,
  isBlockTrade: false,
  exchangesInvolved: ['binance'],
  summary: 'old',
  details: 'old',
});

store.prune(now);
assert.equal(store.listSignals().length, 0);
console.log('Signals store tests passed!');
