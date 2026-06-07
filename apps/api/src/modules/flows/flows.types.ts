export type HyperliquidFlowKind =
  | 'twap-started'
  | 'twap-completed'
  | 'twap-cancelled'
  | 'core-transfer'
  | 'spot-transfer';

export type HyperliquidFlowStatus = 'forming' | 'active' | 'finished';
export type HyperliquidFlowSide = 'buy' | 'sell' | 'transfer';
export type HyperliquidFlowProvider = 'mock' | 'quicknode';

export interface HyperliquidFlowItem {
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

export interface HyperliquidFlowsResponse {
  provider: HyperliquidFlowProvider;
  items: HyperliquidFlowItem[];
}
