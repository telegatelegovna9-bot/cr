// @crypto-screener/shared - Core type definitions

// ============================================================
// EXCHANGE TYPES
// ============================================================

export type ExchangeId =
  | 'binance'
  | 'bybit'
  | 'okx'
  | 'kucoin'
  | 'bitget'
  | 'gate'
  | 'mexc'
  | 'hyperliquid'
  | 'coinbase';

export const ALL_EXCHANGES: ExchangeId[] = [
  'binance', 'bybit', 'okx', 'kucoin', 'bitget', 'gate', 'mexc', 'hyperliquid', 'coinbase',
];

// ============================================================
// MARKET DATA TYPES
// ============================================================

export interface Ticker {
  exchange: string;
  marketType: 'spot' | 'futures';
  symbol: string;
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
  priceChangePercent24h?: number;
  quoteVolume24h?: number;
  trades24h?: number;
  bid?: number;
  ask?: number;
  spread?: number;
}

export interface Candle {
  exchange: string;
  marketType: 'spot' | 'futures';
  symbol: string;
  timeframe: string;
  time: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  trades?: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export interface OrderBookLevel {
  price: number;
  quantity: number;
  count?: number;
}

export interface OrderBook {
  symbol: string;
  exchange: ExchangeId;
  marketType?: 'spot' | 'futures';
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  marketType?: 'spot' | 'futures';
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

// ============================================================
// LIQUIDITY TYPES
// ============================================================

export interface LiquidityLevel {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
  type: 'limit' | 'iceberg' | 'spoof' | 'wall';
  strength: number; // 0-1
  timestamp: number;
}

export interface LiquidityHeatmapPoint {
  price: number;
  time: number;
  intensity: number; // 0-1
  volume: number;
  type: 'bid' | 'ask';
}

export interface DeltaZone {
  startPrice: number;
  endPrice: number;
  delta: number;
  volume: number;
  type: 'absorption' | 'exhaustion' | 'sweep';
}

// ============================================================
// ALERT TYPES
// ============================================================

export type AlertType =
  | 'listing'
  | 'volume_spike'
  | 'volatility_spike'
  | 'breakout'
  | 'liquidity_appear'
  | 'funding_anomaly'
  | 'oi_spike'
  | 'price_cross'
  | 'pump'
  | 'dump'
  | 'market_signal';

export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  symbol: string;
  exchange: ExchangeId;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

export interface AlertRule {
  id: string;
  type: AlertType;
  symbol?: string;
  exchange?: ExchangeId;
  condition: Record<string, unknown>;
  enabled: boolean;
  channels: ('in_app' | 'telegram' | 'push' | 'email')[];
}

// ============================================================
// WEBSOCKET TYPES
// ============================================================

export type WSChannel =
  | 'ticker'
  | 'candle'
  | 'orderbook'
  | 'trades'
  | 'alerts'
  | 'liquidity';

export interface WSMessage {
  channel: WSChannel;
  event: 'subscribe' | 'unsubscribe' | 'data' | 'error';
  symbol?: string;
  exchange?: ExchangeId;
  timeframe?: Timeframe;
  data?: unknown;
  timestamp: number;
}

export interface WSSubscription {
  channel: WSChannel;
  symbol?: string;
  exchange?: ExchangeId;
  timeframe?: Timeframe;
}

// ============================================================
// UI STATE TYPES
// ============================================================

export interface ChartWidget {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  timeframe: Timeframe;
  position: { x: number; y: number; w: number; h: number };
  overlays: string[];
}

export interface Workspace {
  id: string;
  name: string;
  widgets: ChartWidget[];
  layout: 'grid' | 'free';
  createdAt: number;
  updatedAt: number;
}

export type ViewMode = 'terminal' | 'screener' | 'heatmap' | 'patterns' | 'alerts' | 'settings' | 'grid';

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// EXCHANGE CONFIG TYPES
// ============================================================

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  wsUrl: string;
  restUrl: string;
  rateLimit: number;
  enabled: boolean;
}

export interface NormalizedSymbol {
  base: string;
  quote: string;
  unified: string; // e.g., "BTC/USDT"
  perExchange: Record<ExchangeId, string>;
}

// ============================================================
// ALERT CONFIG
// ============================================================

export interface AlertConfig {
  soundEnabled: boolean;
  browserNotifications: boolean;
  visualFlash: boolean;
  autoDismiss: boolean;
  autoDismissSeconds: number;
  timeframes: Timeframe[];
}
