import assert from 'node:assert/strict';
import { FlowsService } from './flows.service';

const service = new FlowsService();

const all = service.listHyperliquidFlows({});
assert.equal(all.provider, 'mock');
assert.equal(all.items.length > 0, true);

const twapOnly = service.listHyperliquidFlows({ kind: 'twap-started' });
assert.equal(twapOnly.items.every(item => item.kind === 'twap-started'), true);

const largeOnly = service.listHyperliquidFlows({ minUsd: 2_000_000 });
assert.equal(largeOnly.items.every(item => item.usdValue >= 2_000_000), true);

const searched = service.listHyperliquidFlows({ search: 'zec' });
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
