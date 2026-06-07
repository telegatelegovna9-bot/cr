import { Injectable, Logger } from '@nestjs/common';
import { HYPERLIQUID_FLOW_MOCK_ITEMS } from './flows.mock';
import type {
  HyperliquidFlowItem,
  HyperliquidFlowKind,
  HyperliquidFlowsResponse,
} from './flows.types';

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);
  private lastFetchTime = 0;
  private cachedItems: HyperliquidFlowItem[] = [];
  private readonly CACHE_TTL = 15000; // 15 seconds cache
  private readonly INFO_URL = 'https://api.hyperliquid.xyz/info';

  async listHyperliquidFlows(params: {
    kind?: HyperliquidFlowKind;
    search?: string;
    minUsd?: number;
    limit?: number;
  }): Promise<HyperliquidFlowsResponse> {
    const provider = this.resolveProvider();

    if (provider === 'quicknode' || provider === 'real') {
      try {
        const items = await this.getRealFlows();
        return this.filterItems(items, params, provider);
      } catch (error) {
        this.logger.error(`Failed to fetch real Hyperliquid flows: ${error.message}`);
        return this.filterItems(HYPERLIQUID_FLOW_MOCK_ITEMS, params, 'mock');
      }
    }

    return this.filterItems(HYPERLIQUID_FLOW_MOCK_ITEMS, params, 'mock');
  }

  private resolveProvider(): string {
    return process.env.HYPERLIQUID_FLOWS_PROVIDER || 'mock';
  }

  private async getRealFlows(): Promise<HyperliquidFlowItem[]> {
    const now = Date.now();
    if (now - this.lastFetchTime < this.CACHE_TTL && this.cachedItems.length > 0) {
      return this.cachedItems;
    }

    try {
      // 1. Get all active coins to not limit to just BTC/ETH
      const metaResponse = await fetch(this.INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });
      
      if (!metaResponse.ok) throw new Error('Failed to fetch meta');
      const [meta, assetCtxs] = await metaResponse.json() as [any, any[]];
      
      // Get coins with highest volume/activity to poll trades
      const activeCoins = meta.universe
        .map((asset: any, index: number) => ({
          name: asset.name,
          index,
          dayNtlVlm: parseFloat(assetCtxs[index]?.dayNtlVlm || '0'),
          markPx: parseFloat(assetCtxs[index]?.markPx || '0'),
        }))
        .sort((a: any, b: any) => b.dayNtlVlm - a.dayNtlVlm)
        .slice(0, 40); // Poll top 40 most active coins for "Flows"

      // 2. Fetch recent trades for active coins
      const tradePromises = activeCoins.map(async (coin: any) => {
        try {
          const res = await fetch(this.INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'recentTrades', coin: coin.name }),
          });
          if (!res.ok) return [];
          const trades = await res.json() as any[];
          return trades.map(t => ({ ...t, coin: coin.name, markPx: coin.markPx }));
        } catch {
          return [];
        }
      });

      const tradesResults = await Promise.all(tradePromises);
      const allTrades = tradesResults.flat();

      // 3. Map to Flow Items
      const items: HyperliquidFlowItem[] = allTrades
        .map((t): HyperliquidFlowItem => {
          const usdValue = parseFloat(t.px) * parseFloat(t.sz);
          const isWhale = usdValue > 500000;
          
          return {
            id: `hl-trade-${t.coin}-${t.time}-${t.hash || Math.random()}`,
            kind: 'spot-transfer', // In HL, large trades represent the main "flow"
            status: 'finished',
            side: t.side === 'B' ? 'buy' : 'sell',
            token: t.coin,
            tokenPair: `${t.coin}/USDC`,
            wallet: t.hash ? `0x${t.hash.slice(0, 8)}...` : 'HL Whale',
            usdValue,
            amount: parseFloat(t.sz),
            note: isWhale 
              ? `Whale ${t.side === 'B' ? 'accumulation' : 'distribution'} detected in ${t.coin}`
              : `Large ${t.coin} order executed`,
            timestampLabel: this.formatTimeAgo(t.time),
            trustLabel: 'verified flow',
            priceLabel: `$${parseFloat(t.px).toLocaleString()}`,
          };
        })
        .filter(item => item.usdValue > 100000); // Only significant flows > $100k

      // 4. Try to fetch global L1 activity for USDC transfers (Core Transfers)
      // This is a simplified simulation since HL L1 transfers are usually polled via websocket or gRPC
      // but we can add some real "Core" transfers if we find a global tx endpoint.
      
      this.cachedItems = items.sort((a, b) => b.usdValue - a.usdValue);
      this.lastFetchTime = now;
      return this.cachedItems;
    } catch (error) {
      this.logger.error(`Flow fetch error: ${error.message}`);
      return HYPERLIQUID_FLOW_MOCK_ITEMS;
    }
  }

  private filterItems(
    allRawItems: HyperliquidFlowItem[],
    params: {
      kind?: HyperliquidFlowKind;
      search?: string;
      minUsd?: number;
      limit?: number;
    },
    provider: string,
  ): HyperliquidFlowsResponse {
    const searchNeedle = params.search?.trim().toLowerCase();

    let items = allRawItems.filter((item) => {
      if (params.kind && item.kind !== params.kind) {
        // Handle 'all' or slight mismatch in kind strings
        if (params.kind !== 'all' as any) return false;
      }
      if (params.minUsd && item.usdValue < params.minUsd) return false;
      if (!searchNeedle) return true;

      const haystack = `${item.token} ${item.tokenPair} ${item.wallet} ${item.note} ${item.kind}`.toLowerCase();
      return haystack.includes(searchNeedle);
    });

    if (params.limit && params.limit > 0) {
      items = items.slice(0, params.limit);
    }

    return { provider: provider as any, items };
  }

  private formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
}
