// WebSocket hook for real-time market data with singleton connection management

'use client';

import { useEffect } from 'react';
import {
  useAlertStore,
  useDrawingStore,
  useMarketStore,
  useOrderbookStore,
  useUIStore,
  useWSStore,
} from '@/stores';
import {
  createSharedWebSocketManager,
  type ManagedSubscription,
} from './websocket-manager';

const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

let sharedManager: ReturnType<typeof createSharedWebSocketManager> | null = null;
let lifecycleListenersAttached = false;

function handleSocketMessage(event: { data: string }) {
  let payload: { channel?: string; data?: any; event?: string };

  try {
    payload = JSON.parse(event.data);
  } catch (err) {
    console.error('[WS] Failed to parse message:', err, event.data);
    return;
  }

  try {
    const { channel, data, event: wsEvent } = payload;

    if (wsEvent === 'subscribed' || wsEvent === 'unsubscribed') {
      return;
    }

    switch (channel) {
      case 'ticker':
        useMarketStore.getState().updateTicker(data);
        break;
      case 'candle':
        useMarketStore.getState().updateCandle(data);
        break;
      case 'orderbook':
        useOrderbookStore.getState().updateOrderbook(data);
        break;
      case 'alert': {
        useUIStore.getState().addAlert(data);
        if (data.data?.signalId) {
          const drawingStore = useDrawingStore.getState();
          const drawing = drawingStore.byId[data.data.signalId];
          if (drawing?.kind === 'signal_level') {
            drawingStore.upsertDrawing({
              ...drawing,
              triggered: true,
              triggeredAt: data.createdAt || Date.now(),
              armed: false,
              updatedAt: Date.now(),
            });
          }
        }
        break;
      }
      case 'signal_alert': {
        useUIStore.getState().addAlert({
          id: `signal-history-${data.id}`,
          type: 'market_signal',
          priority: data.minUsdThreshold >= 500_000 ? 'high' : 'medium',
          symbol: data.symbol,
          exchange: data.exchange,
          title: data.title,
          message: data.body,
          data: {
            signalId: data.signalId,
            minUsdThreshold: data.minUsdThreshold,
            eventType: data.eventType,
            side: data.side,
            usdValue: data.usdValue,
            venues: data.exchangesInvolved,
          },
          read: false,
          createdAt: data.timestamp,
        });

        useAlertStore.getState().addTriggeredAlert({
          id: `signal-toast-${data.id}`,
          alertId: data.signalId,
          symbol: data.symbol,
          alert: {
            type: 'market_signal',
            condition: data.title,
            value: data.usdValue,
          },
          currentPrice: data.price,
          triggeredAt: data.timestamp,
          exchange: data.exchange,
          message: data.body,
          eventType: data.eventType,
          venues: data.exchangesInvolved,
        });
        break;
      }
      case 'pattern':
        useUIStore.getState().addPattern(data);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[WS] Message handler error:', err, payload);
  }
}

function getSharedManager() {
  if (sharedManager) return sharedManager;

  sharedManager = createSharedWebSocketManager({
    url: getWsUrl(),
    onOpen: () => {
      useWSStore.getState().setConnected(true);
      useWSStore.getState().setReconnecting(false);
      useWSStore.getState().setError(null);
    },
    onClose: (event) => {
      console.log(`[WS] Connection closed: ${event.code ?? ''} ${event.reason ?? ''}`);
      useWSStore.getState().setConnected(false);
    },
    onReconnectScheduled: () => {
      useWSStore.getState().setReconnecting(true);
    },
    onMessage: handleSocketMessage,
    onError: (error) => {
      console.error('[WS] Error:', error);
      useWSStore.getState().setError('WebSocket error');
    },
  });

  return sharedManager;
}

function attachLifecycleListeners(manager: ReturnType<typeof createSharedWebSocketManager>) {
  if (lifecycleListenersAttached || typeof window === 'undefined') return;

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      manager.handleVisibilityVisible();
    }
  };

  const handleFocus = () => {
    manager.handleWindowFocus();
  };

  const handleOnline = () => {
    manager.handleOnline();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleOnline);
  lifecycleListenersAttached = true;
}

function toManagedSubscription(
  exchange: string,
  marketType: 'spot' | 'futures',
  symbol: string,
  timeframe?: string,
  channel?: string,
): ManagedSubscription {
  return {
    exchange,
    marketType,
    symbol,
    timeframe,
    channel,
  };
}

export function useWebSocket() {
  const manager = getSharedManager();
  const connected = useWSStore(state => state.connected);

  useEffect(() => {
    attachLifecycleListeners(manager);
    manager.connect();
  }, [manager]);

  return {
    subscribe: (
      exchange: string,
      marketType: 'spot' | 'futures',
      symbol: string,
      timeframe?: string,
      channel?: string,
    ) => {
      manager.subscribe(toManagedSubscription(exchange, marketType, symbol, timeframe, channel));
    },
    unsubscribe: (
      exchange: string,
      marketType: 'spot' | 'futures',
      symbol: string,
      timeframe?: string,
      channel?: string,
    ) => {
      manager.unsubscribe(toManagedSubscription(exchange, marketType, symbol, timeframe, channel));
    },
    socket: manager.getSocket(),
    connected,
  };
}
