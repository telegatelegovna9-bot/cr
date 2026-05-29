// WebSocket hook for real-time market data

'use client';

import { useEffect, useRef, useCallback } from 'react';
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

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updateTicker, updateCandle } = useMarketStore();
  const { addAlert, addPattern } = useUIStore();
  const { setConnected, setReconnecting } = useWSStore();

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log(`[WS] Connecting to: ${WS_URL}`);
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('[WS] Connection established');
      setConnected(true);
      setReconnecting(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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
      // Exponential backoff or simple delay
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          setReconnecting(true);
          reconnectTimerRef.current = null;
          connect();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    socketRef.current = socket;
  }, [updateTicker, updateCandle, addAlert, addPattern, setConnected, setReconnecting]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const subscribe = useCallback((exchange: string, marketType: 'spot' | 'futures', symbol: string, timeframe?: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'subscribe',
        exchange,
        marketType,
        symbol,
        timeframe
      }));
    }
  }, []);

  const unsubscribe = useCallback((exchange: string, marketType: 'spot' | 'futures', symbol: string, timeframe?: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        exchange,
        marketType,
        symbol,
        timeframe
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { subscribe, unsubscribe, socket: socketRef.current };
}
