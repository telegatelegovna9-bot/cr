export type HyperliquidFlowKind =
  | 'twap-started'
  | 'twap-completed'
  | 'twap-cancelled'
  | 'core-transfer'
  | 'spot-transfer';

export type HyperliquidFlowStatus = 'forming' | 'active' | 'finished';
export type HyperliquidFlowSide = 'buy' | 'sell' | 'transfer';
export type HyperliquidFlowProvider = 'mock' | 'quicknode';

export interface HyperliquidFlowEvent {
  id: string;
  kind: HyperliquidFlowKind;
  status: HyperliquidFlowStatus;
  side: HyperliquidFlowSide;
  token: string;
  tokenPair?: string;
  wallet: string;
  fromAddress?: string;
  toAddress?: string;
  usdValue: number;
  amount: number;
  frequencyLabel?: string;
  etaLabel?: string;
  periodLabel?: string;
  note: string;
  timestampLabel: string;
  trustLabel: string;
  marketCapLabel?: string;
  volume24hLabel?: string;
  priceLabel?: string;
}

export function formatFlowUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatFlowAmount(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function shortenAddress(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
