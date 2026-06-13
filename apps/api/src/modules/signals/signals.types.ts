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
