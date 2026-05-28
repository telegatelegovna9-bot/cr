// Zustand stores for global state management

import { create } from 'zustand';
import type { ExchangeId, Timeframe, ViewMode, Alert, AlertConfig, Ticker } from '@crypto-screener/shared';

// ============================================================
// Market Store
// ============================================================

interface TickerData {
  symbol: string;
  exchange: ExchangeId;
  price: number;
  priceChangePercent24h: number;
  volume24h: number;
  quoteVolume24h: number;
  trades24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  spread: number;
  lastUpdate: number;
}

interface MarketStore {
  tickers: Map<string, TickerData>;
  selectedSymbol: string;
  selectedExchange: ExchangeId;
  selectedTimeframe: Timeframe;
  connectedExchanges: ExchangeId[];
  selectedCoin: string | null;

  setTickers: (tickers: TickerData[]) => void;
  updateTicker: (ticker: TickerData) => void;
  setSelectedSymbol: (symbol: string) => void;
  setSelectedExchange: (exchange: ExchangeId) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setConnectedExchanges: (exchanges: ExchangeId[]) => void;
  setSelectedCoin: (coin: string | null) => void;
  getTicker: (symbol: string, exchange: ExchangeId) => TickerData | undefined;
  getTickersArray: () => TickerData[];
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  tickers: new Map(),
  selectedSymbol: 'BTC/USDT',
  selectedExchange: 'binance',
  selectedTimeframe: '1h',
  connectedExchanges: [],
  selectedCoin: null,

  setTickers: (tickers) => {
    const map = new Map<string, TickerData>();
    tickers.forEach(t => map.set(`${t.exchange}:${t.symbol}`, t));
    set({ tickers: map });
  },

  updateTicker: (ticker) => {
    set(state => {
      const newMap = new Map(state.tickers);
      newMap.set(`${ticker.exchange}:${ticker.symbol}`, ticker);
      return { tickers: newMap };
    });
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

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  toggleCoinList: () => set(state => ({ coinListOpen: !state.coinListOpen })),
  setSelectedCoin: (coin) => set({ selectedCoin: coin }),
  setChartGridSize: (size) => set({ chartGridSize: size }),
  toggleHeatmap: () => set(state => ({ showHeatmap: !state.showHeatmap })),
  toggleAlerts: () => set(state => ({ alertsOpen: !state.alertsOpen })),
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),

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
