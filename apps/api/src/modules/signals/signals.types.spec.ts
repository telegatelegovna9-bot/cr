import assert from 'node:assert/strict';
import type { SignalEvent, SignalEventType } from './signals.types';

const event: SignalEvent = {
  id: 'sig-1',
  timestamp: Date.now(),
  exchange: 'binance',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  side: 'buy',
  eventType: 'large_buy',
  usdValue: 250000,
  tradeCount: 1,
  price: 100000,
  confidenceScore: 0.8,
  priorityScore: 0.9,
  isBlockTrade: false,
  exchangesInvolved: ['binance'],
  summary: 'Large buy on Binance',
  details: 'Single large aggressive buy',
};

assert.equal(event.eventType, 'large_buy' satisfies SignalEventType);
assert.equal(event.exchangesInvolved.length, 1);
console.log('Signal type contract tests passed!');
