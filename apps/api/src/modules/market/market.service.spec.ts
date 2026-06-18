import assert from 'node:assert/strict';
import { MarketService } from './market.service';
import type { Candle, OrderBook } from '@crypto-screener/shared';

function createService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let fetchCandlesImpl: (...args: unknown[]) => Promise<Candle[]> = async () => [];
  let fetchOrderBookImpl: (...args: unknown[]) => Promise<OrderBook | null> = async () => null;

  const exchangeManager = {
    on: () => undefined,
    disconnectAll: () => undefined,
    subscribeTicker: (...args: unknown[]) => calls.push({ method: 'subscribeTicker', args }),
    unsubscribeTicker: (...args: unknown[]) => calls.push({ method: 'unsubscribeTicker', args }),
    subscribeTrades: (...args: unknown[]) => calls.push({ method: 'subscribeTrades', args }),
    unsubscribeTrades: (...args: unknown[]) => calls.push({ method: 'unsubscribeTrades', args }),
    subscribeCandle: (...args: unknown[]) => calls.push({ method: 'subscribeCandle', args }),
    unsubscribeCandle: (...args: unknown[]) => calls.push({ method: 'unsubscribeCandle', args }),
    subscribeOrderBook: (...args: unknown[]) => calls.push({ method: 'subscribeOrderBook', args }),
    unsubscribeOrderBook: (...args: unknown[]) => calls.push({ method: 'unsubscribeOrderBook', args }),
    fetchCandles: async (...args: unknown[]) => fetchCandlesImpl(...args),
    fetchOrderBook: async (...args: unknown[]) => fetchOrderBookImpl(...args),
    fetchAllTickers: async () => [],
  };

  const db = {
    publish: async () => undefined,
    query: async () => undefined,
    cacheSet: async () => undefined,
  };

  const alertsService = {
    checkPriceSignals: () => undefined,
  };

  const gateway = {
    broadcast: () => undefined,
  };

  const service = new MarketService(
    db as never,
    alertsService as never,
    gateway as never,
  );
  (service as any).exchangeManager = exchangeManager;

  return {
    service,
    calls,
    setFetchCandlesImpl: (impl: (...args: unknown[]) => Promise<Candle[]>) => {
      fetchCandlesImpl = impl;
    },
    setFetchOrderBookImpl: (impl: (...args: unknown[]) => Promise<OrderBook | null>) => {
      fetchOrderBookImpl = impl;
    },
  };
}

async function runTest() {
  {
    const { service, calls } = createService();

    service.subscribeSymbol('BTC/USDT');
    service.subscribeCandle('BTC/USDT', '1m', 'binance');
    service.unsubscribeCandle('BTC/USDT', '1m', 'binance');

    assert.equal(calls.some(call => call.method === 'unsubscribeTrades'), false);
  }

  {
    const { service, calls } = createService();

    service.subscribeOrderBook('BTC/USDT', 'spot', 'binance');
    service.subscribeOrderBook('BTC/USDT', 'spot', 'binance');
    service.unsubscribeOrderBook('BTC/USDT', 'spot', 'binance');

    assert.equal(calls.some(call => call.method === 'unsubscribeOrderBook'), false);

    service.unsubscribeOrderBook('BTC/USDT', 'spot', 'binance');
    assert.equal(calls.filter(call => call.method === 'unsubscribeOrderBook').length, 1);
  }

  {
    const { service, calls } = createService();

    service.subscribeOrderBook('BTC/USDT', 'spot', 'binance');
    service.subscribeOrderBook('BTC/USDT', 'futures', 'binance');
    service.unsubscribeOrderBook('BTC/USDT', 'spot', 'binance');

    assert.equal(calls.filter(call => call.method === 'unsubscribeOrderBook').length, 1);

    service.unsubscribeOrderBook('BTC/USDT', 'futures', 'binance');
    assert.equal(calls.filter(call => call.method === 'unsubscribeOrderBook').length, 2);
  }

  {
    const { service, setFetchOrderBookImpl } = createService();

    (service as any).handleOrderBook({
      exchange: 'binance',
      marketType: 'spot',
      symbol: 'BTC/USDT',
      bids: [{ price: 100, quantity: 2 }],
      asks: [{ price: 101, quantity: 3 }],
      timestamp: 1710000000000,
    });

    (service as any).handleOrderBook({
      exchange: 'binance',
      marketType: 'futures',
      symbol: 'BTC/USDT',
      bids: [{ price: 200, quantity: 4 }],
      asks: [{ price: 201, quantity: 5 }],
      timestamp: 1710000000100,
    });

    const spot = service.getLatestOrderBook('BTC/USDT', 'binance', 'spot');
    const futures = service.getLatestOrderBook('BTC/USDT', 'binance', 'futures');

    assert.equal(spot?.marketType, 'spot');
    assert.equal(spot?.bids[0]?.price, 100);
    assert.equal(futures?.marketType, 'futures');
    assert.equal(futures?.bids[0]?.price, 200);

    setFetchOrderBookImpl(async (symbol: unknown, exchange: unknown) => ({
      exchange: exchange as 'binance',
      marketType: 'futures',
      symbol: symbol as string,
      bids: [{ price: 300, quantity: 1 }],
      asks: [{ price: 301, quantity: 1 }],
      timestamp: 1710000000200,
    }));

    const fetched = await service.getOrderBook('ETH/USDT', 'binance', 'futures');
    assert.equal(fetched?.marketType, 'futures');
  }

  {
    const { service, setFetchCandlesImpl } = createService();
    const now = Date.now();
    const timeframeMs = 60_000;
    const cached = Array.from({ length: 300 }, (_, index) => ({
      exchange: 'binance',
      marketType: 'spot' as const,
      symbol: 'BTC/USDT',
      timeframe: '1m' as const,
      time: now - (299 - index) * timeframeMs,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
      isClosed: true,
    }));

    (service as any).candleCache.set('candle:BTC/USDT:binance:1m', cached);
    setFetchCandlesImpl(async () => {
      throw new Error('should not fetch when cache is fresh and contiguous');
    });

    const candles = await service.getCandles('BTC/USDT', '1m', 'binance', 300);
    assert.equal(candles.length, 300);
  }

  {
    const { service, setFetchCandlesImpl } = createService();
    const now = Date.now();
    const timeframeMs = 60_000;
    const cached = Array.from({ length: 300 }, (_, index) => ({
      exchange: 'binance',
      marketType: 'spot' as const,
      symbol: 'BTC/USDT',
      timeframe: '1m' as const,
      time: now - (300 - index) * timeframeMs,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
      isClosed: true,
    }));
    cached.splice(150, 1);

    (service as any).candleCache.set('candle:BTC/USDT:binance:1m', cached);

    let fetched = false;
    setFetchCandlesImpl(async () => {
      fetched = true;
      return [{
        exchange: 'binance',
        marketType: 'spot' as const,
        symbol: 'BTC/USDT',
        timeframe: '1m' as const,
        time: now,
        open: 1,
        high: 2,
        low: 1,
        close: 2,
        volume: 10,
        isClosed: true,
      }];
    });

    await service.getCandles('BTC/USDT', '1m', 'binance', 300);
    assert.equal(fetched, true);
  }

  console.log('MarketService ownership tests passed!');
}

runTest().catch(err => {
  console.error('MarketService ownership tests failed:', err);
  process.exit(1);
});
