// Zustand stores for global state management

import { create } from 'zustand';
import type { ExchangeId, Timeframe, ViewMode, Alert, AlertConfig, Ticker, Candle, OrderBook } from '@crypto-screener/shared';
import type { HeatmapSettings } from '@/lib/liquidity-engine';
import { DEFAULT_HEATMAP_SETTINGS } from '@/lib/liquidity-engine';
import type {
  AnyDrawing,
  DrawingOperationEvent,
  DrawingOperationPayload,
  DrawingTool,
  InstrumentMarketType,
} from '@/lib/drawings/models';
import { makeInstrumentKey } from '@/lib/drawings/models';
import { loadPersistedDrawings, savePersistedDrawings } from '@/lib/drawings/persistence';
import { createDrawingSyncBus } from '@/lib/drawings/sync-bus';

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
// Drawing Store
// ============================================================

const DRAWING_VISIBILITY_SCOPE = '*';

function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

function appendDrawingId(ids: string[] | undefined, id: string): string[] {
  if (!ids || ids.length === 0) return [id];
  if (ids.includes(id)) return ids;
  return [...ids, id];
}

function removeDrawingId(ids: string[] | undefined, id: string): string[] {
  if (!ids || ids.length === 0) return [];
  return ids.filter(currentId => currentId !== id);
}

function indexDrawings(drawings: AnyDrawing[]): Pick<DrawingStore, 'byId' | 'byInstrument'> {
  const byId: Record<string, AnyDrawing> = {};
  const byInstrument: Record<string, string[]> = {};

  for (const drawing of drawings) {
    byId[drawing.id] = drawing;
    byInstrument[drawing.instrumentKey] = appendDrawingId(byInstrument[drawing.instrumentKey], drawing.id);
  }

  return { byId, byInstrument };
}

function drawingSnapshot(byId: Record<string, AnyDrawing>): AnyDrawing[] {
  return Object.values(byId);
}

function getInitialDrawingIndex(): Pick<DrawingStore, 'byId' | 'byInstrument'> {
  if (typeof window === 'undefined') return { byId: {}, byInstrument: {} };
  const persisted = loadPersistedDrawings(window.localStorage);
  return indexDrawings(persisted.drawings);
}

const scheduleDrawingPersist = debounce((drawings: AnyDrawing[]) => {
  if (typeof window === 'undefined') return;
  savePersistedDrawings(window.localStorage, drawings);
}, 120);

const drawingSyncOrigin = `drawings-${Math.random().toString(36).slice(2, 10)}`;
const drawingSyncBus = typeof window === 'undefined' ? null : createDrawingSyncBus(drawingSyncOrigin);
let drawingSyncUnsubscribe: (() => void) | null = null;

interface DrawingStore {
  byId: Record<string, AnyDrawing>;
  byInstrument: Record<string, string[]>;
  selectedTool: DrawingTool;
  hidden: boolean;
  lastOperation: DrawingOperationEvent | null;

  upsertDrawing: (drawing: AnyDrawing) => void;
  removeDrawing: (id: string) => void;
  getDrawingsForInstrument: (exchange: string, marketType: InstrumentMarketType, symbol: string) => AnyDrawing[];
  clearInstrument: (exchange: string, marketType: InstrumentMarketType, symbol: string) => void;
  setSelectedTool: (tool: DrawingTool) => void;
  setHidden: (value: boolean) => void;
  resetSignal: (id: string) => void;
  applyOperation: (event: DrawingOperationEvent) => void;
}

export const useDrawingStore = create<DrawingStore>((set, get) => {
  const initialIndex = getInitialDrawingIndex();

  const persistById = (byId: Record<string, AnyDrawing>) => {
    scheduleDrawingPersist(drawingSnapshot(byId));
  };

  const publish = (event: Omit<DrawingOperationEvent, 'origin' | 'occurredAt'>) => {
    if (!drawingSyncBus) return;
    drawingSyncBus.emit({
      ...event,
      origin: drawingSyncOrigin,
      occurredAt: Date.now(),
    } as DrawingOperationEvent);
  };

  const store: DrawingStore = {
    byId: initialIndex.byId,
    byInstrument: initialIndex.byInstrument,
    selectedTool: 'cursor',
    hidden: false,
    lastOperation: null,

    upsertDrawing: (drawing) => {
      const existing = get().byId[drawing.id];
      set(state => {
        const instrumentIds = appendDrawingId(state.byInstrument[drawing.instrumentKey], drawing.id);
        const byId = { ...state.byId, [drawing.id]: drawing };
        persistById(byId);
        return {
          byId,
          byInstrument: { ...state.byInstrument, [drawing.instrumentKey]: instrumentIds },
        };
      });

      if (existing) {
        publish({
          type: 'update',
          drawing,
          instrumentKey: drawing.instrumentKey,
        });
      } else {
        publish({
          type: 'create',
          drawing,
          instrumentKey: drawing.instrumentKey,
        });
      }
    },

    removeDrawing: (id) => {
      const current = get().byId[id];
      if (!current) return;

      set(state => {
        const byId = { ...state.byId };
        delete byId[id];
        persistById(byId);

        const nextIds = removeDrawingId(state.byInstrument[current.instrumentKey], id);
        const byInstrument = { ...state.byInstrument };
        if (nextIds.length > 0) byInstrument[current.instrumentKey] = nextIds;
        else delete byInstrument[current.instrumentKey];

        return { byId, byInstrument };
      });

      publish({
        type: 'delete',
        drawingId: id,
        instrumentKey: current.instrumentKey,
      });
    },

    getDrawingsForInstrument: (exchange, marketType, symbol) => {
      const state = get();
      const instrumentKey = makeInstrumentKey(exchange, marketType, symbol);
      const ids = state.byInstrument[instrumentKey] ?? [];
      return ids.map(id => state.byId[id]).filter((drawing): drawing is AnyDrawing => drawing !== undefined);
    },

    clearInstrument: (exchange, marketType, symbol) =>
      set(state => {
        const instrumentKey = makeInstrumentKey(exchange, marketType, symbol);
        const ids = state.byInstrument[instrumentKey];
        if (!ids || ids.length === 0) return state;

        const byId = { ...state.byId };
        for (const id of ids) delete byId[id];
        persistById(byId);

        const byInstrument = { ...state.byInstrument };
        delete byInstrument[instrumentKey];
        return { byId, byInstrument };
      }),

    setSelectedTool: (tool) => set({ selectedTool: tool }),

    setHidden: (value) => {
      set({ hidden: value });
      publish({
        type: 'visibility',
        hidden: value,
        instrumentKey: DRAWING_VISIBILITY_SCOPE,
      });
    },

    resetSignal: (id) => {
      const current = get().byId[id];
      if (!current || current.kind !== 'signal_level') return;

      const nextSignal = {
        ...current,
        triggered: false,
        triggeredAt: null,
        armed: true,
        updatedAt: Date.now(),
      };

      set(state => {
        const byId = { ...state.byId, [id]: nextSignal };
        persistById(byId);
        return { byId };
      });

      publish({
        type: 'reset',
        drawingId: id,
        instrumentKey: nextSignal.instrumentKey,
      });
    },

    applyOperation: (event) =>
      set(state => {
        if (event.type === 'create' || event.type === 'update') {
          const instrumentIds = appendDrawingId(state.byInstrument[event.drawing.instrumentKey], event.drawing.id);
          const byId = { ...state.byId, [event.drawing.id]: event.drawing };
          persistById(byId);
          return {
            byId,
            byInstrument: { ...state.byInstrument, [event.drawing.instrumentKey]: instrumentIds },
            lastOperation: event,
          };
        }

        if (event.type === 'delete') {
          const current = state.byId[event.drawingId];
          if (!current) return { lastOperation: event };

          const byId = { ...state.byId };
          delete byId[event.drawingId];
          persistById(byId);

          const ids = removeDrawingId(state.byInstrument[current.instrumentKey], event.drawingId);
          const byInstrument = { ...state.byInstrument };
          if (ids.length > 0) byInstrument[current.instrumentKey] = ids;
          else delete byInstrument[current.instrumentKey];

          return { byId, byInstrument, lastOperation: event };
        }

        if (event.type === 'reset') {
          const current = state.byId[event.drawingId];
          if (!current || current.kind !== 'signal_level') return { lastOperation: event };

          const byId = {
            ...state.byId,
            [event.drawingId]: {
              ...current,
              triggered: false,
              triggeredAt: null,
              armed: true,
              updatedAt: Date.now(),
            },
          };
          persistById(byId);
          return { byId, lastOperation: event };
        }

        return { hidden: event.hidden, lastOperation: event };
      }),
  };

  if (drawingSyncBus && !drawingSyncUnsubscribe) {
    drawingSyncUnsubscribe = drawingSyncBus.subscribe(event => {
      store.applyOperation(event);
    });
  }

  return store;
});

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
