import type { HyperliquidFlowEvent, HyperliquidFlowKind, HyperliquidFlowProvider } from './models';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

export async function fetchHyperliquidFlows(params?: {
  kind?: HyperliquidFlowKind | 'all';
  search?: string;
  minUsd?: number;
  limit?: number;
}): Promise<{ provider: HyperliquidFlowProvider; items: HyperliquidFlowEvent[] }> {
  const searchParams = new URLSearchParams();
  if (params?.kind && params.kind !== 'all') searchParams.set('kind', params.kind);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.minUsd) searchParams.set('minUsd', String(params.minUsd));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${API_BASE}/api/flows/hyperliquid?${searchParams.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Hyperliquid flows: ${response.status}`);
  }

  const data = await response.json();
  return {
    provider: data.provider,
    items: data.items,
  };
}
