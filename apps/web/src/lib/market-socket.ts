'use client';

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  || (typeof window !== 'undefined' && window.location.port === '3000' ? 'http://localhost:3001' : '');

let socket: Socket | null = null;
const subscriptions = new Map<string, number>();

interface MarketSubscription {
  channel: string;
  symbol?: string;
  exchange?: string;
  timeframe?: string;
}

function subscriptionKey(payload: MarketSubscription): string {
  return JSON.stringify([
    payload.channel,
    payload.symbol || '*',
    payload.exchange || '*',
    payload.timeframe || '*',
  ]);
}

export function getMarketSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/market`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
    socket.on('connect', () => {
      for (const key of subscriptions.keys()) {
        const [channel, symbol, exchange, timeframe] = JSON.parse(key);
        socket?.emit('subscribe', {
          channel,
          ...(symbol !== '*' ? { symbol } : {}),
          ...(exchange !== '*' ? { exchange } : {}),
          ...(timeframe !== '*' ? { timeframe } : {}),
        });
      }
    });
  }

  return socket;
}

export function subscribeMarket(payload: MarketSubscription): void {
  const socket = getMarketSocket();
  const key = subscriptionKey(payload);
  const count = subscriptions.get(key) || 0;
  subscriptions.set(key, count + 1);

  if (count === 0) {
    socket.emit('subscribe', payload);
  }
}

export function unsubscribeMarket(payload: MarketSubscription): void {
  const socket = getMarketSocket();
  const key = subscriptionKey(payload);
  const count = subscriptions.get(key) || 0;

  if (count <= 1) {
    subscriptions.delete(key);
    if (socket.connected) socket.emit('unsubscribe', payload);
    return;
  }

  subscriptions.set(key, count - 1);
}
