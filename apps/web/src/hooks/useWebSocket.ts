// WebSocket hook for real-time market data

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMarketStore, useUIStore, useWSStore } from '@/stores';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { updateTicker } = useMarketStore();
  const { addAlert, addPattern } = useUIStore();
  const { setConnected, setReconnecting } = useWSStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(`${WS_URL}/market`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      setReconnecting(false);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('reconnect_attempt', () => {
      setReconnecting(true);
    });

    socket.on('reconnect', () => {
      setConnected(true);
      setReconnecting(false);
    });

    // Market data events
    socket.on('ticker', (ticker) => {
      updateTicker(ticker);
    });

    socket.on('alert', (alert) => {
      addAlert(alert);
    });

    socket.on('pattern', (pattern) => {
      addPattern(pattern);
    });

    socketRef.current = socket;
  }, [updateTicker, addAlert, addPattern, setConnected, setReconnecting]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const subscribe = useCallback((channel: string, symbol?: string, exchange?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { channel, symbol, exchange });
    }
  }, []);

  const unsubscribe = useCallback((channel: string, symbol?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', { channel, symbol });
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { subscribe, unsubscribe, socket: socketRef.current };
}
