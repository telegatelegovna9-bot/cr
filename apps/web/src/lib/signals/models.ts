export type SignalEventType =
  | 'large_buy'
  | 'large_sell'
  | 'block_trade'
  | 'buy_cluster'
  | 'sell_cluster'
  | 'cross_exchange_activity'
  | 'anomalous_activity';

export interface SignalEvent {
  id: string;
  timestamp: number;
  exchange: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: 'buy' | 'sell';
  eventType: SignalEventType;
  usdValue: number;
  tradeCount: number;
  price: number;
  confidenceScore: number;
  priorityScore: number;
  isBlockTrade: boolean;
  exchangesInvolved: string[];
  summary: string;
  details: string;
}

export interface SignalAlert {
  id: string;
  signalId: string;
  timestamp: number;
  minUsdThreshold: number;
  title: string;
  body: string;
}

export function formatSignalUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatSignalPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}

export function formatSignalTradeCount(value: number): string {
  return value === 1 ? '1 print' : `${value} prints`;
}

export function formatSignalTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function signalTypeLabel(value: SignalEventType): string {
  switch (value) {
    case 'large_buy':
      return 'Large Buy';
    case 'large_sell':
      return 'Large Sell';
    case 'block_trade':
      return 'Block Trade';
    case 'buy_cluster':
      return 'Buy Cluster';
    case 'sell_cluster':
      return 'Sell Cluster';
    case 'cross_exchange_activity':
      return 'Cross-Exchange';
    case 'anomalous_activity':
      return 'Anomaly';
  }
}

export function signalTypeTone(value: SignalEventType): string {
  switch (value) {
    case 'large_buy':
    case 'buy_cluster':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20';
    case 'large_sell':
    case 'sell_cluster':
      return 'bg-rose-500/10 text-rose-300 border-rose-400/20';
    case 'block_trade':
      return 'bg-amber-500/10 text-amber-300 border-amber-400/20';
    case 'cross_exchange_activity':
      return 'bg-sky-500/10 text-sky-300 border-sky-400/20';
    case 'anomalous_activity':
      return 'bg-violet-500/10 text-violet-300 border-violet-400/20';
  }
}
