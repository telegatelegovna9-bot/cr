import assert from 'node:assert/strict';
import type { Candle, OrderBook, Ticker } from '@crypto-screener/shared';
import { MarketGateway } from './market.gateway';

class FakeClient {
  public readonly sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }

  on(_event: string, _handler: (...args: any[]) => void) {
    return this;
  }
}

function createGateway(overrides?: {
  ticker?: Ticker | null;
  candle?: Candle | null;
  orderbook?: OrderBook | null;
}) {
  const db = {
    createSubscriber: () => ({
      subscribe: () => undefined,
      on: () => undefined,
    }),
  };

  const marketService = {
    subscribeSymbol: () => undefined,
    unsubscribeSymbol: () => undefined,
    subscribeCandle: () => undefined,
    unsubscribeCandle: () => undefined,
    subscribeOrderBook: () => undefined,
    unsubscribeOrderBook: () => undefined,
    getTickers: () => (overrides?.ticker ? [overrides.ticker] : []),
    getLatestCandle: () => overrides?.candle ?? null,
    getLatestOrderBook: () => overrides?.orderbook ?? null,
  };

  return new MarketGateway(db as never, marketService as never);
}

async function runTest() {
  const gateway = createGateway({
    candle: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      timeframe: '1m',
      time: 1710000000000,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
      isClosed: false,
    },
    orderbook: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      bids: [{ price: 100, quantity: 2 }],
      asks: [{ price: 101, quantity: 3 }],
      timestamp: 1710000000000,
    },
  });

  const candleClient = new FakeClient();
  gateway.handleConnection(candleClient as never);
  (gateway as any).handleSubscription(candleClient, {
    action: 'subscribe',
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    timeframe: '1m',
  });

  assert.equal(candleClient.sent.length, 2);
  assert.deepEqual(JSON.parse(candleClient.sent[1]), {
    channel: 'candle',
    data: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      timeframe: '1m',
      time: 1710000000000,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
      isClosed: false,
    },
  });

  const orderbookClient = new FakeClient();
  gateway.handleConnection(orderbookClient as never);
  (gateway as any).handleSubscription(orderbookClient, {
    action: 'subscribe',
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    channel: 'orderbook',
  });

  assert.equal(orderbookClient.sent.length, 2);
  assert.deepEqual(JSON.parse(orderbookClient.sent[1]), {
    channel: 'orderbook',
    data: {
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      bids: [{ price: 100, quantity: 2 }],
      asks: [{ price: 101, quantity: 3 }],
      timestamp: 1710000000000,
    },
  });

  console.log('MarketGateway snapshot tests passed!');
}

runTest().catch(err => {
  console.error('MarketGateway snapshot tests failed:', err);
  process.exit(1);
});
