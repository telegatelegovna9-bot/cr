import assert from 'node:assert/strict';
import { SignalsAggregator } from './signals.aggregator';

const aggregator = new SignalsAggregator();
const now = Date.now();

const output = aggregator.aggregate([
  {
    id: 'a',
    timestamp: now,
    exchange: 'binance',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    side: 'buy',
    price: 100000,
    quantity: 1,
    usdValue: 100000,
    isBlockTrade: false,
  },
  {
    id: 'b',
    timestamp: now + 10_000,
    exchange: 'coinbase',
    symbol: 'BTC-USD',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    side: 'buy',
    price: 100100,
    quantity: 1,
    usdValue: 100100,
    isBlockTrade: false,
  },
]);

assert.equal(output.some(item => item.eventType === 'cross_exchange_activity'), true);
console.log('Signals aggregator tests passed!');
