// WebSocket hook for real-time market data with singleton connection management

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMarketStore, useUIStore, useWSStore } from '@/stores';

// Dynamic WS URL logic for production
const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws';
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

const WS_URL = getWsUrl();

// Singleton state outside the hook
let sharedSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const activeSubscriptions = new Set<string>();

export function useWebSocket() {
  const { updateTicker, updateCandle } = useMarketStore();
  const { addAlert, addPattern } = useUIStore();
  const { setConnected, setReconnecting } = useWSStore();
  const [, forceUpdate] = useState({});

  const connect = useCallback(() => {
    if (sharedSocket && (sharedSocket.readyState === WebSocket.OPEN || sharedSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log(`[WS] Connecting to: ${WS_URL}`);
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('[WS] Connection established');
      setConnected(true);
      setReconnecting(false);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Re-subscribe to all active channels
      activeSubscriptions.forEach(subJson => {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(subJson);
          }
        } catch (err) {
          console.error('[WS] Re-subscribe error:', err);
        }
      });
    };

    socket.onmessage = (event) => {
      try {
        const { channel, data, event: wsEvent } = JSON.parse(event.data);
        
        if (wsEvent === 'subscribed' || wsEvent === 'unsubscribed') {
          return;
        }

        switch (channel) {
          case 'ticker':
            updateTicker(data);
            break;
          case 'candle':
            updateCandle(data);
            break;
          case 'alert':
            addAlert(data);
            break;
          case 'pattern':
            addPattern(data);
            break;
        }
      } catch (err) {
        console.error('[WS] Message parse error:', err);
      }
    };

    socket.onclose = (e) => {
      console.log(`[WS] Connection closed: ${e.code} ${e.reason}`);
      setConnected(false);
      sharedSocket = null;
      
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          setReconnecting(true);
          reconnectTimer = null;
          connect();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    sharedSocket = socket;
    forceUpdate({}); // Trigger re-render to update socket reference in hook return
  }, [updateTicker, updateCandle, addAlert, addPattern, setConnected, setReconnecting]);

  const subscribe = useCallback((exchange: string, marketType: 'spot' | 'futures', symbol: string, timeframe?: string, channel?: string) => {
    const sub = JSON.stringify({
      action: 'subscribe',
      exchange,
      marketType,
      symbol,
      timeframe,
      channel
    });
    
    activeSubscriptions.add(sub);
    
    if (sharedSocket?.readyState === WebSocket.OPEN) {
      sharedSocket.send(sub);
    }
  }, []);

  const unsubscribe = useCallback((exchange: string, marketType: 'spot' | 'futures', symbol: string, timeframe?: string, channel?: string) => {
    const subStr = JSON.stringify({
      action: 'subscribe', // We need to match the original sub to remove it
      exchange,
      marketType,
      symbol,
      timeframe,
      channel
    });
    
    activeSubscriptions.delete(subStr);

    if (sharedSocket?.readyState === WebSocket.OPEN) {
      sharedSocket.send(JSON.stringify({
        action: 'unsubscribe',
        exchange,
        marketType,
        symbol,
        timeframe,
        channel
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    // No disconnect on unmount as it's a shared connection
  }, [connect]);

  return { subscribe, unsubscribe, socket: sharedSocket, connected: !!(sharedSocket && sharedSocket.readyState === WebSocket.OPEN) };
}
