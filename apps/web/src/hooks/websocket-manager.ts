export interface ManagedSubscription {
  exchange: string;
  marketType: 'spot' | 'futures';
  symbol: string;
  timeframe?: string;
  channel?: string;
}

type ManagedAction = 'subscribe' | 'unsubscribe';

type SocketLike = {
  readyState: number;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  send: (payload: string) => void;
};

interface SharedWebSocketManagerOptions {
  url: string;
  reconnectDelayMs?: number;
  createSocket?: (url: string) => SocketLike;
  scheduleTimeout?: (callback: () => void, delayMs: number) => number;
  clearScheduledTimeout?: (id: number) => void;
  onOpen?: () => void;
  onClose?: (event: { code?: number; reason?: string }) => void;
  onMessage?: (event: { data: string }) => void;
  onError?: (error: unknown) => void;
  onReconnectScheduled?: () => void;
}

interface SubscriptionState {
  refCount: number;
  subscription: ManagedSubscription;
}

function defaultCreateSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

function defaultScheduleTimeout(callback: () => void, delayMs: number): number {
  return window.setTimeout(callback, delayMs);
}

function defaultClearScheduledTimeout(id: number): void {
  window.clearTimeout(id);
}

function isSocketOpen(socket: SocketLike | null): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

function isSocketConnecting(socket: SocketLike | null): boolean {
  return !!socket && socket.readyState === WebSocket.CONNECTING;
}

function toPayload(action: ManagedAction, subscription: ManagedSubscription): string {
  return JSON.stringify({
    action,
    exchange: subscription.exchange,
    marketType: subscription.marketType,
    symbol: subscription.symbol,
    timeframe: subscription.timeframe,
    channel: subscription.channel,
  });
}

export function subscriptionKey(subscription: ManagedSubscription): string {
  return JSON.stringify({
    exchange: subscription.exchange,
    marketType: subscription.marketType,
    symbol: subscription.symbol,
    timeframe: subscription.timeframe,
    channel: subscription.channel,
  });
}

export function createSharedWebSocketManager(options: SharedWebSocketManagerOptions) {
  const reconnectDelayMs = options.reconnectDelayMs ?? 3000;
  const createSocket = options.createSocket ?? defaultCreateSocket;
  const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout;
  const clearScheduledTimeout = options.clearScheduledTimeout ?? defaultClearScheduledTimeout;

  let socket: SocketLike | null = null;
  let reconnectTimerId: number | null = null;
  const subscriptions = new Map<string, SubscriptionState>();

  const clearReconnectTimer = () => {
    if (reconnectTimerId === null) return;
    clearScheduledTimeout(reconnectTimerId);
    reconnectTimerId = null;
  };

  const replayActiveSubscriptions = () => {
    if (!isSocketOpen(socket)) return;
    const activeSocket = socket;
    if (!activeSocket) return;
    for (const { subscription } of subscriptions.values()) {
      activeSocket.send(toPayload('subscribe', subscription));
    }
  };

  const connect = () => {
    if (isSocketOpen(socket) || isSocketConnecting(socket)) return;

    const nextSocket = createSocket(options.url);
    nextSocket.onopen = () => {
      clearReconnectTimer();
      replayActiveSubscriptions();
      options.onOpen?.();
    };
    nextSocket.onmessage = (event) => {
      options.onMessage?.(event);
    };
    nextSocket.onclose = (event) => {
      socket = null;
      options.onClose?.(event);

      if (reconnectTimerId === null) {
        reconnectTimerId = scheduleTimeout(() => {
          reconnectTimerId = null;
          options.onReconnectScheduled?.();
          connect();
        }, reconnectDelayMs);
      }
    };
    nextSocket.onerror = (error) => {
      options.onError?.(error);
    };

    socket = nextSocket;
  };

  const subscribe = (subscription: ManagedSubscription) => {
    const key = subscriptionKey(subscription);
    const existing = subscriptions.get(key);

    if (existing) {
      existing.refCount += 1;
      return;
    }

    subscriptions.set(key, { refCount: 1, subscription });

    if (isSocketOpen(socket)) {
      socket?.send(toPayload('subscribe', subscription));
    }
  };

  const unsubscribe = (subscription: ManagedSubscription) => {
    const key = subscriptionKey(subscription);
    const existing = subscriptions.get(key);
    if (!existing) return;

    if (existing.refCount > 1) {
      existing.refCount -= 1;
      return;
    }

    subscriptions.delete(key);

    if (isSocketOpen(socket)) {
      socket?.send(toPayload('unsubscribe', subscription));
    }
  };

  const recoverNow = () => {
    clearReconnectTimer();
    if (!isSocketOpen(socket) && !isSocketConnecting(socket)) {
      connect();
    }
  };

  return {
    connect,
    subscribe,
    unsubscribe,
    handleVisibilityVisible: recoverNow,
    handleWindowFocus: recoverNow,
    handleOnline: recoverNow,
    getSocket: () => socket,
    isConnected: () => isSocketOpen(socket),
    getActiveSubscriptionCount: () => subscriptions.size,
  };
}
