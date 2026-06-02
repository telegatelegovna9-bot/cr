import type { DrawingOperationEvent } from './models.ts';
import { isDrawingOperationType } from './models.ts';

export const DRAWINGS_SYNC_CHANNEL = 'aionui-drawings';

export interface DrawingSyncBus {
  subscribe: (handler: (event: DrawingOperationEvent) => void) => () => void;
  emit: (event: DrawingOperationEvent) => void;
  dispose: () => void;
}

interface MinimalBroadcastChannel {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  close: () => void;
}

interface CreateDrawingSyncBusOptions {
  channelName?: string;
  createChannel?: (name: string) => MinimalBroadcastChannel | null;
}

function normalizeEvent(value: unknown): DrawingOperationEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Partial<DrawingOperationEvent>;

  if (
    typeof event.type !== 'string' ||
    !isDrawingOperationType(event.type) ||
    typeof event.origin !== 'string' ||
    typeof event.instrumentKey !== 'string' ||
    typeof event.occurredAt !== 'number'
  ) {
    return null;
  }

  if ((event.type === 'create' || event.type === 'update') && typeof event.drawing !== 'object') return null;
  if ((event.type === 'delete' || event.type === 'reset') && typeof event.drawingId !== 'string') return null;
  if (event.type === 'visibility' && typeof event.hidden !== 'boolean') return null;

  return event as DrawingOperationEvent;
}

function defaultChannelFactory(name: string): MinimalBroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(name);
}

export function createDrawingSyncBus(
  origin: string,
  options: CreateDrawingSyncBusOptions = {},
): DrawingSyncBus {
  const listeners = new Set<(event: DrawingOperationEvent) => void>();
  const createChannel = options.createChannel ?? defaultChannelFactory;
  const channel = createChannel(options.channelName ?? DRAWINGS_SYNC_CHANNEL);

  const dispatch = (event: DrawingOperationEvent) => {
    if (event.origin === origin) return;
    listeners.forEach(listener => listener(event));
  };

  const handleChannelMessage = (message: MessageEvent<unknown>) => {
    const event = normalizeEvent(message.data);
    if (event) dispatch(event);
  };

  if (channel) channel.addEventListener('message', handleChannelMessage);

  return {
    subscribe: (handler) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    emit: (event) => {
      if (channel) channel.postMessage(event);
      dispatch(event);
    },
    dispose: () => {
      listeners.clear();
      if (!channel) return;
      channel.removeEventListener('message', handleChannelMessage);
      channel.close();
    },
  };
}
