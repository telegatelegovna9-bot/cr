import { Injectable } from '@nestjs/common';
import { HYPERLIQUID_FLOW_MOCK_ITEMS } from './flows.mock';
import type {
  HyperliquidFlowItem,
  HyperliquidFlowKind,
  HyperliquidFlowsResponse,
} from './flows.types';

@Injectable()
export class FlowsService {
  listHyperliquidFlows(params: {
    kind?: HyperliquidFlowKind;
    search?: string;
    minUsd?: number;
    limit?: number;
  }): HyperliquidFlowsResponse {
    const provider = this.resolveProvider();

    if (provider === 'quicknode' && process.env.HYPERLIQUID_QUICKNODE_HTTP_URL) {
      // Placeholder until real provider wiring is added.
      // We keep the response shape stable now so frontend can switch to backend immediately.
      return this.filterMockItems(params, 'quicknode');
    }

    return this.filterMockItems(params, 'mock');
  }

  private resolveProvider(): 'mock' | 'quicknode' {
    return process.env.HYPERLIQUID_FLOWS_PROVIDER === 'quicknode' ? 'quicknode' : 'mock';
  }

  private filterMockItems(
    params: {
      kind?: HyperliquidFlowKind;
      search?: string;
      minUsd?: number;
      limit?: number;
    },
    provider: 'mock' | 'quicknode',
  ): HyperliquidFlowsResponse {
    const searchNeedle = params.search?.trim().toLowerCase();

    let items = HYPERLIQUID_FLOW_MOCK_ITEMS.filter((item) => {
      if (params.kind && item.kind !== params.kind) return false;
      if (params.minUsd && item.usdValue < params.minUsd) return false;
      if (!searchNeedle) return true;

      const haystack = [
        item.token,
        item.tokenPair,
        item.wallet,
        item.fromAddress,
        item.toAddress,
        item.note,
        item.kind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchNeedle);
    });

    items = [...items].sort((a, b) => {
      const statusRank = (value: HyperliquidFlowItem['status']) => {
        switch (value) {
          case 'forming': return 0;
          case 'active': return 1;
          default: return 2;
        }
      };

      return statusRank(a.status) - statusRank(b.status) || b.usdValue - a.usdValue;
    });

    if (params.limit && params.limit > 0) {
      items = items.slice(0, params.limit);
    }

    return { provider, items };
  }
}
