// WebSocket hook for real-time market data with singleton connection management

'use client';

import { useEffect } from 'react';
import {
  useAlertStore,
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
        break;
      }
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
