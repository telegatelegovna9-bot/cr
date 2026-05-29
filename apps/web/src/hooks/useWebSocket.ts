// WebSocket hook for real-time market data

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMarketStore, useUIStore, useWSStore } from '@/stores';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

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

    console.log(`Connecting to WebSocket: ${WS_URL}`);
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('WebSocket connected');
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
        console.error('Failed to parse WS message:', err);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      // Simple reconnect logic
      reconnectTimerRef.current = setTimeout(() => {
        setReconnecting(true);
        connect();
      }, 3000);
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
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
