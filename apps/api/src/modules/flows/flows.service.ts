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
  private readonly CACHE_TTL = 30000; // 30 seconds for flows
  private readonly META_CACHE_TTL = 1800000; // 30 minutes for coin list
  private readonly BUFFER_RETENTION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_BUFFER_ITEMS = 1000;
  private readonly BASE_MIN_USD = Number(process.env.HYPERLIQUID_FLOWS_BASE_MIN_USD || 25_000);
  private readonly INFO_URL = 'https://api-ui.hyperliquid.xyz/info';
  private lastFetchTime = 0;
  private cachedItems: BufferedFlowItem[] = [];
  private cachedMeta: any = null;
  private lastMetaFetchTime = 0;

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
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        this.logger.error(`Failed to fetch real Hyperliquid flows: ${errorMessage}`);
        return this.filterItems(this.cachedItems.length > 0 ? this.cachedItems : HYPERLIQUID_FLOW_MOCK_ITEMS, params, 'mock');
      }
    }

    return this.filterItems(HYPERLIQUID_FLOW_MOCK_ITEMS, params, 'mock');
  }

  private resolveProvider(): string {
    return process.env.HYPERLIQUID_FLOWS_PROVIDER || 'mock';
  }

  private async getRealFlows(): Promise<HyperliquidFlowItem[]> {
    const now = Date.now();

    // Always respect cooldown, even if we had an error before
    if (now - this.lastFetchTime < this.CACHE_TTL && this.cachedItems.length > 0) {
      this.cachedItems = this.pruneBufferedItems(this.cachedItems, now);
      return this.cachedItems;
    }

    // Cooldown even on errors to prevent hammering
    this.lastFetchTime = now;

    try {
      // 1. Get Meta (with long cache)
      if (!this.cachedMeta || now - this.lastMetaFetchTime > this.META_CACHE_TTL) {
        const metaResponse = await fetch(this.INFO_URL, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
          signal: AbortSignal.timeout(10000),
        });
        
        if (!metaResponse.ok) {
          const text = await metaResponse.text();
          throw new Error(`HTTP ${metaResponse.status}: ${text.slice(0, 50)}`);
        }
        this.cachedMeta = await metaResponse.json();
        this.lastMetaFetchTime = now;
      }

      const [meta, assetCtxs] = this.cachedMeta as [any, any[]];
      
      // Get top 20 coins (reduced from 40 to avoid 429)
      const activeCoins = meta.universe
        .map((asset: any, index: number) => ({
          name: asset.name,
          index,
          dayNtlVlm: parseFloat(assetCtxs[index]?.dayNtlVlm || '0'),
        }))
        .sort((a: any, b: any) => b.dayNtlVlm - a.dayNtlVlm)
        .slice(0, 20);

      // 2. Fetch recent trades (with small delay between batches if needed)
      const tradePromises = activeCoins.map(async (coin: any) => {
        try {
          const res = await fetch(this.INFO_URL, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({ type: 'recentTrades', coin: coin.name }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return [];
          return (await res.json() as any[]).map(t => ({ ...t, coin: coin.name }));
        } catch {
          return [];
        }
      });

      const tradesResults = await Promise.all(tradePromises);
      const allTrades = tradesResults.flat();

      const items: BufferedFlowItem[] = allTrades
        .map((t): BufferedFlowItem => {
          const usdValue = parseFloat(t.px) * parseFloat(t.sz);
          const timestampMs = Number(t.time) || now;
          return {
            id: this.buildTradeId(t),
            kind: 'spot-transfer',
            status: 'finished',
            side: t.side === 'B' ? 'buy' : 'sell',
            token: t.coin,
            tokenPair: `${t.coin}/USDC`,
            wallet: t.hash ? `0x${t.hash.slice(0, 8)}...` : 'Whale',
            usdValue,
            amount: parseFloat(t.sz),
            note: usdValue > 500000 ? `Whale movement in ${t.coin}` : `Significant ${t.coin} trade`,
            timestampLabel: this.formatTimeAgo(timestampMs),
            trustLabel: 'verified',
            priceLabel: `$${parseFloat(t.px).toLocaleString()}`,
            timestampMs,
          };
        })
        .filter(item => item.usdValue >= this.BASE_MIN_USD);

      this.cachedItems = this.mergeIntoBuffer(items, now);
      return this.cachedItems;
    } catch (error: any) {
      this.logger.error(`Flow fetch error: ${error.message}`);
      throw error;
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

  private buildTradeId(trade: any): string {
    return [
      'hl-t',
      trade.coin,
      trade.time,
      trade.side,
      trade.px,
      trade.sz,
      trade.hash || 'nohash',
    ].join('-');
  }

  private mergeIntoBuffer(nextItems: BufferedFlowItem[], now: number): BufferedFlowItem[] {
    const merged = new Map<string, BufferedFlowItem>();

    for (const item of this.cachedItems) {
      merged.set(item.id, item);
    }

    for (const item of nextItems) {
      merged.set(item.id, item);
    }

    const pruned = this.pruneBufferedItems(Array.from(merged.values()), now);
    pruned.sort((a, b) => {
      if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;
      return b.usdValue - a.usdValue;
    });

    return pruned.slice(0, this.MAX_BUFFER_ITEMS);
  }

  private pruneBufferedItems(items: BufferedFlowItem[], now: number): BufferedFlowItem[] {
    const oldestAllowed = now - this.BUFFER_RETENTION_MS;
    return items.filter((item) => item.timestampMs >= oldestAllowed);
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

type BufferedFlowItem = HyperliquidFlowItem & {
  timestampMs: number;
};
