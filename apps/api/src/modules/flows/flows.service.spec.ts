import assert from 'node:assert/strict';
import { FlowsService } from './flows.service';

async function runTest() {
  await runMockProviderAssertions();
  await runRealProviderAssertions();
  console.log('FlowsService tests passed!');
}

async function runMockProviderAssertions() {
  delete process.env.HYPERLIQUID_FLOWS_PROVIDER;
  const service = new FlowsService();

  const all = await service.listHyperliquidFlows({});
  assert.equal(all.provider, 'mock');
  assert.equal(all.items.length > 0, true);

  const twapOnly = await service.listHyperliquidFlows({ kind: 'twap-started' });
  assert.equal(twapOnly.items.every(item => item.kind === 'twap-started'), true);

  const largeOnly = await service.listHyperliquidFlows({ minUsd: 2_000_000 });
  assert.equal(largeOnly.items.every(item => item.usdValue >= 2_000_000), true);

  const searched = await service.listHyperliquidFlows({ search: 'zec' });
  assert.equal(searched.items.length > 0, true);
  assert.equal(
    searched.items.every(item =>
      [item.token, item.tokenPair, item.wallet, item.note]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes('zec'),
    ),
    true,
  );
}

async function runRealProviderAssertions() {
  process.env.HYPERLIQUID_FLOWS_PROVIDER = 'quicknode';
  process.env.HYPERLIQUID_FLOWS_BASE_MIN_USD = '25000';

  const originalFetch = global.fetch;
  const now = Date.now();

  let recentTradesCallCount = 0;
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));

    if (body.type === 'metaAndAssetCtxs') {
      return {
        ok: true,
        json: async () => [
          {
            universe: [
              { name: 'BTC' },
              { name: 'ETH' },
            ],
          },
          [
            { dayNtlVlm: '10000000' },
            { dayNtlVlm: '9000000' },
          ],
        ],
      } as Response;
    }

    if (body.type === 'recentTrades') {
      recentTradesCallCount += 1;
      const trades = body.coin === 'BTC'
        ? [
            { time: now - 5_000, side: 'B', px: '100000', sz: '1.5', hash: 'abc123' },
            { time: now - 20_000, side: 'S', px: '100000', sz: '0.001', hash: 'tiny1' },
          ]
        : [
            { time: now - 2_000, side: 'S', px: '2500', sz: '20', hash: 'def456' },
            { time: now - 2_000, side: 'S', px: '2500', sz: '20', hash: 'def456' },
          ];

      return {
        ok: true,
        json: async () => trades,
      } as Response;
    }

    throw new Error(`Unexpected fetch body: ${JSON.stringify(body)}`);
  }) as typeof fetch;

  try {
    const service = new FlowsService();

    const all = await service.listHyperliquidFlows({});
    assert.equal(all.provider, 'quicknode');
    assert.equal(all.items.length, 2);
    assert.equal(all.items[0]?.token, 'ETH');
    assert.equal(all.items.every(item => item.usdValue >= 25_000), true);

    const filtered100k = await service.listHyperliquidFlows({ minUsd: 100_000 });
    assert.equal(filtered100k.items.length, 1);
    assert.equal(filtered100k.items[0]?.token, 'BTC');

    const firstTradeFetchCount = recentTradesCallCount;
    const cachedAgain = await service.listHyperliquidFlows({});
    assert.equal(cachedAgain.items.length, 2);
    assert.equal(recentTradesCallCount, firstTradeFetchCount);
  } finally {
    global.fetch = originalFetch;
    delete process.env.HYPERLIQUID_FLOWS_PROVIDER;
    delete process.env.HYPERLIQUID_FLOWS_BASE_MIN_USD;
  }
}

runTest().catch(err => {
  console.error('FlowsService tests failed:', err);
  process.exit(1);
});
