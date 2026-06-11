import assert from 'node:assert/strict';
import { MarketService } from './market.service';

function createService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];

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
    fetchCandles: async () => [],
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

  const gateway = {
    broadcast: () => undefined,
  };

  const service = new MarketService(db as never, alertsService as never, gateway as never);
  (service as any).exchangeManager = exchangeManager;

  return { service, calls };
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

  console.log('MarketService ownership tests passed!');
}

runTest().catch(err => {
  console.error('MarketService ownership tests failed:', err);
  process.exit(1);
});
