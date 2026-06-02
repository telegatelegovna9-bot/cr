// Zustand stores for global state management

import { create } from 'zustand';
import type { ExchangeId, Timeframe, ViewMode, Alert, AlertConfig, Ticker, Candle, OrderBook } from '@crypto-screener/shared';
import type { HeatmapSettings } from '@/lib/liquidity-engine';
import { DEFAULT_HEATMAP_SETTINGS } from '@/lib/liquidity-engine';

// ============================================================
// Market Store
// ============================================================

function candleMapKey(candle: { exchange: string; marketType?: string; symbol: string; timeframe: string }): string {
  return `${candle.exchange}:${candle.marketType ?? 'spot'}:${candle.symbol}:${candle.timeframe}`;
}

interface MarketStore {
  tickers: Map<string, Ticker>;
  tickersLoaded: boolean;
  latestCandles: Map<string, Candle>;
  selectedSymbol: string;
  selectedExchange: ExchangeId;
  selectedTimeframe: Timeframe;
  connectedExchanges: ExchangeId[];
  selectedCoin: string | null;

  setTickers: (tickers: Ticker[]) => void;
  updateTicker: (ticker: Ticker) => void;
  updateCandle: (candle: Candle) => void;
  getLatestCandle: (exchange: string, marketType: string, symbol: string, timeframe: string) => Candle | undefined;
  setSelectedSymbol: (symbol: string) => void;
  setSelectedExchange: (exchange: ExchangeId) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setConnectedExchanges: (exchanges: ExchangeId[]) => void;
  setSelectedCoin: (coin: string | null) => void;
  getTicker: (symbol: string, exchange: string) => Ticker | undefined;
  getTickersArray: () => Ticker[];
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  tickers: new Map(),
  tickersLoaded: false,
  latestCandles: new Map(),
  selectedSymbol: 'BTC/USDT',
  selectedExchange: 'binance',
  selectedTimeframe: '1h',
  connectedExchanges: [],
  selectedCoin: null,

  setTickers: (tickers) => {
    const map = new Map<string, Ticker>();
    tickers.forEach(t => map.set(`${t.exchange}:${t.symbol}`, t));
    set({ tickers: map, tickersLoaded: true });
  },

  updateTicker: (ticker) => {
    set(state => {
      const newMap = new Map(state.tickers);
      newMap.set(`${ticker.exchange}:${ticker.symbol}`, ticker);
      return { tickers: newMap };
    });
  },

  updateCandle: (candle) => {
    const key = candleMapKey(candle);
    set(state => {
      const newMap = new Map(state.latestCandles);
      newMap.set(key, candle);
      return { latestCandles: newMap };
    });
  },

  getLatestCandle: (exchange, marketType, symbol, timeframe) => {
    return get().latestCandles.get(`${exchange}:${marketType}:${symbol}:${timeframe}`);
  },

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSelectedExchange: (exchange) => set({ selectedExchange: exchange }),
  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
  setConnectedExchanges: (exchanges) => set({ connectedExchanges: exchanges }),
  setSelectedCoin: (coin) => set({ selectedCoin: coin }),

  getTicker: (symbol, exchange) => get().tickers.get(`${exchange}:${symbol}`),
  getTickersArray: () => Array.from(get().tickers.values()),
}));

// ============================================================
// UI Store
// ============================================================

interface UIStore {
  viewMode: ViewMode;
  sidebarOpen: boolean;
  coinListOpen: boolean;
  selectedCoin: string | null;
  chartGridSize: 1 | 4 | 6 | 9;
  showHeatmap: boolean;
  showAlerts: boolean;
  alertsOpen: boolean;
  settingsOpen: boolean;
  alerts: Alert[];
  unreadAlertCount: number;
  patterns: any[];
  heatmapSettings: HeatmapSettings;

  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  toggleCoinList: () => void;
  setSelectedCoin: (coin: string | null) => void;
  setChartGridSize: (size: 1 | 4 | 6 | 9) => void;
  toggleHeatmap: () => void;
  toggleAlerts: () => void;
  toggleSettings: () => void;
  addAlert: (alert: Alert) => void;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  setAlerts: (alerts: Alert[]) => void;
  setPatterns: (patterns: any[]) => void;
  addPattern: (pattern: any) => void;
  setHeatmapSettings: (patch: Partial<HeatmapSettings>) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'terminal',
  sidebarOpen: true,
  coinListOpen: true,
  selectedCoin: null,
  chartGridSize: 4,
  showHeatmap: false,
  showAlerts: false,
  alertsOpen: false,
  settingsOpen: true,
  alerts: [],
  unreadAlertCount: 0,
  patterns: [],
  heatmapSettings: DEFAULT_HEATMAP_SETTINGS,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  toggleCoinList: () => set(state => ({ coinListOpen: !state.coinListOpen })),
  setSelectedCoin: (coin) => set({ selectedCoin: coin }),
  setChartGridSize: (size) => set({ chartGridSize: size }),
  toggleHeatmap: () => set(state => ({ showHeatmap: !state.showHeatmap })),
  toggleAlerts: () => set(state => ({ alertsOpen: !state.alertsOpen })),
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  setHeatmapSettings: (patch) => set(state => ({
    heatmapSettings: { ...state.heatmapSettings, ...patch },
  })),

  addAlert: (alert) => set(state => ({
    alerts: [alert, ...state.alerts].slice(0, 200),
    unreadAlertCount: state.unreadAlertCount + 1,
  })),
  markAlertRead: (id) => set(state => ({
    alerts: state.alerts.map(a => a.id === id ? { ...a, read: true } : a),
    unreadAlertCount: Math.max(0, state.unreadAlertCount - 1),
  })),
  markAllAlertsRead: () => set(state => ({
    alerts: state.alerts.map(a => ({ ...a, read: true })),
    unreadAlertCount: 0,
  })),
  setAlerts: (alerts) => set({
    alerts,
    unreadAlertCount: alerts.filter(a => !a.read).length,
  }),
  setPatterns: (patterns) => set({ patterns }),
  addPattern: (pattern) => set(state => ({
    patterns: [pattern, ...state.patterns].slice(0, 200),
  })),
}));

// ============================================================
// WebSocket Store
// ============================================================

interface WSStore {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWSStore = create<WSStore>((set) => ({
  connected: false,
  reconnecting: false,
  error: null,
  setConnected: (connected) => set({ connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setError: (error) => set({ error }),
}));

// ============================================================
// Orderbook Store  (lightweight — only latest snapshot per symbol:exchange)
// ============================================================

interface OrderbookStore {
  books: Map<string, OrderBook>;
  updateOrderbook: (ob: OrderBook) => void;
  getOrderbook: (symbol: string, exchange: string) => OrderBook | undefined;
}

// Throttle map: key -> last update timestamp
const orderbookThrottle = new Map<string, number>();
const ORDERBOOK_THROTTLE_MS = 300;

export const useOrderbookStore = create<OrderbookStore>((set, get) => ({
  books: new Map(),

  updateOrderbook: (ob) => {
    const key = `${ob.exchange}:${ob.symbol}`;
    const now = Date.now();
    const lastUpdate = orderbookThrottle.get(key) || 0;

    if (now - lastUpdate < ORDERBOOK_THROTTLE_MS) return;

    orderbookThrottle.set(key, now);
    set(state => {
      const newMap = new Map(state.books);
      newMap.set(key, ob);
      return { books: newMap };
    });
  },

  getOrderbook: (symbol, exchange) => get().books.get(`${exchange}:${symbol}`),
}));

// ============================================================
// Drawing Store (Persistent)
// ============================================================

export type DrawingType = 'horizontal_line' | 'trendline' | 'signal_level';

export interface BaseDrawing {
  id: string;
  type: DrawingType;
  symbol: string;
  exchange: string;
  color: string;
  visible: boolean;
  timestamp: number;
}

export interface HorizontalLineDrawing extends BaseDrawing {
  type: 'horizontal_line';
  price: number;
}

export interface SignalLevelDrawing extends BaseDrawing {
  type: 'signal_level';
  price: number;
  triggered: boolean;
}

export interface TrendlineDrawing extends BaseDrawing {
  type: 'trendline';
  points: {
    t1: number; // timestamp in seconds
    p1: number;
    t2: number;
    p2: number;
  };
}

export type Drawing = HorizontalLineDrawing | TrendlineDrawing | SignalLevelDrawing;

interface DrawingStore {
  drawings: Drawing[];
  selectedTool: DrawingType | 'cursor' | 'ruler';
  
  addDrawing: (drawing: Drawing) => void;
  removeDrawing: (id: string) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  clearDrawings: (symbol?: string, exchange?: string) => void;
  setSelectedTool: (tool: DrawingType | 'cursor' | 'ruler') => void;
}

const STORAGE_KEY = 'cryptoscreener_drawings';

const loadDrawings = (): Drawing[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveDrawings = (drawings: Drawing[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings));
};

export const useDrawingStore = create<DrawingStore>((set) => ({
  drawings: loadDrawings(),
  selectedTool: 'cursor',

  addDrawing: (drawing) => set(state => {
    const next = [...state.drawings, drawing];
    saveDrawings(next);
    return { drawings: next };
  }),

  removeDrawing: (id) => set(state => {
    const next = state.drawings.filter(d => d.id !== id);
    saveDrawings(next);
    return { drawings: next };
  }),

  updateDrawing: (id, patch) => set(state => {
    const next = state.drawings.map(d => d.id === id ? { ...d, ...patch } as Drawing : d);
    saveDrawings(next);
    return { drawings: next };
  }),

  clearDrawings: (symbol, exchange) => set(state => {
    const next = symbol && exchange 
      ? state.drawings.filter(d => d.symbol !== symbol || d.exchange !== exchange)
      : [];
    saveDrawings(next);
    return { drawings: next };
  }),

  setSelectedTool: (tool) => set({ selectedTool: tool }),
}));

// ============================================================
// Alert Store
// ============================================================

interface AlertEntry {
  id: string;
  symbol: string;
  type: string;
  condition: string;
  value: number;
  enabled: boolean;
  createdAt: number;
}

interface TriggeredAlert {
  id: string;
  alertId: string;
  symbol: string;
  alert: {
    type: string;
    condition: string;
    value: number;
  };
  currentPrice: number;
  triggeredAt: number;
}

interface AlertStore {
  alerts: AlertEntry[];
  activeAlerts: TriggeredAlert[];
  triggeredAlerts: TriggeredAlert[];
  config: AlertConfig;

  addAlert: (alert: AlertEntry) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  addTriggeredAlert: (alert: TriggeredAlert) => void;
  dismissAlert: (id: string) => void;
  clearTriggered: () => void;
  updateConfig: (config: Partial<AlertConfig>) => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  activeAlerts: [],
  triggeredAlerts: [],
  config: {
    soundEnabled: true,
    browserNotifications: true,
    visualFlash: true,
    autoDismiss: true,
    autoDismissSeconds: 10,
    timeframes: ['1h', '4h', '1d'],
  },

  addAlert: (alert) => set(state => ({
    alerts: [alert, ...state.alerts],
  })),
  removeAlert: (id) => set(state => ({
    alerts: state.alerts.filter(a => a.id !== id),
  })),
  toggleAlert: (id) => set(state => ({
    alerts: state.alerts.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a),
  })),
  addTriggeredAlert: (alert) => set(state => ({
    activeAlerts: [alert, ...state.activeAlerts].slice(0, 10),
    triggeredAlerts: [alert, ...state.triggeredAlerts].slice(0, 100),
  })),
  dismissAlert: (id) => set(state => ({
    activeAlerts: state.activeAlerts.filter(a => a.id !== id),
  })),
  clearTriggered: () => set({ activeAlerts: [], triggeredAlerts: [] }),
  updateConfig: (config) => set(state => ({
    config: { ...state.config, ...config },
  })),
}));
