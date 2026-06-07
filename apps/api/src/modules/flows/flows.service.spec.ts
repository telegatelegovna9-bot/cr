import assert from 'node:assert/strict';
import { FlowsService } from './flows.service';

async function runTest() {
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
  
  console.log('FlowsService tests passed!');
}

runTest().catch(err => {
  console.error('FlowsService tests failed:', err);
  process.exit(1);
});
