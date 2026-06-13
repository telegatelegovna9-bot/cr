export type SignalExchange = 'hyperliquid' | 'binance' | 'bybit' | 'okx' | 'coinbase';

export type SignalSide = 'buy' | 'sell';

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
  exchange: SignalExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: SignalSide;
  eventType: SignalEventType;
  usdValue: number;
  tradeCount: number;
  price: number;
  confidenceScore: number;
  priorityScore: number;
  isBlockTrade: boolean;
  exchangesInvolved: SignalExchange[];
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

export interface NormalizedTradeEvent {
  id: string;
  timestamp: number;
  exchange: SignalExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: SignalSide;
  price: number;
  quantity: number;
  usdValue: number;
  isBlockTrade: boolean;
}

export interface SignalFeedResponse {
  items: SignalEvent[];
  timestamp: number;
}

export interface SignalAlertsResponse {
  items: SignalAlert[];
  timestamp: number;
}

export interface SignalSummary {
  totalSignals: number;
  totalUsd: number;
  buyUsd: number;
  sellUsd: number;
  blockTrades: number;
  crossExchangeSignals: number;
  anomalies: number;
}

export interface SignalSummaryResponse {
  summary: SignalSummary;
  timestamp: number;
}

export interface SignalHealth {
  lastIngestedAt: number | null;
  lastSignalAt: number | null;
  totalEventsIngested: number;
  totalSignalsStored: number;
  totalAlertsStored: number;
  supportedExchanges: SignalExchange[];
  byExchange: Partial<Record<SignalExchange, { events: number; lastSeenAt: number | null }>>;
}

export interface SignalHealthResponse {
  health: SignalHealth;
  timestamp: number;
}

export interface SignalNotificationPreferences {
  enabled: boolean;
  minUsd: number;
}
