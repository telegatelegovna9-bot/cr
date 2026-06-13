import assert from 'node:assert/strict';
import { MarketService } from './market.service';
import type { Candle } from '@crypto-screener/shared';

function createService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let fetchCandlesImpl: (...args: unknown[]) => Promise<Candle[]> = async () => [];

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
    fetchOrderBook: async () => null,
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

  const signalsService = {
    ingest: () => undefined,
  };

  const gateway = {
    broadcast: () => undefined,
  };

  const service = new MarketService(
    db as never,
    alertsService as never,
    signalsService as never,
    gateway as never,
  );
  (service as any).exchangeManager = exchangeManager;

  return {
    service,
    calls,
    setFetchCandlesImpl: (impl: (...args: unknown[]) => Promise<Candle[]>) => {
      fetchCandlesImpl = impl;
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

    service.subscribeOrderBook('BTC/USDT', 'binance');
    service.subscribeOrderBook('BTC/USDT', 'binance');
    service.unsubscribeOrderBook('BTC/USDT', 'binance');

    assert.equal(calls.some(call => call.method === 'unsubscribeOrderBook'), false);

    service.unsubscribeOrderBook('BTC/USDT', 'binance');
    assert.equal(calls.filter(call => call.method === 'unsubscribeOrderBook').length, 1);
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
