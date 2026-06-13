import type {
  SignalAlert,
  SignalEvent,
  SignalHealth,
  SignalPreferences,
  SignalSummary,
} from './models';
import { getOrCreateSignalClientId } from './preferences';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

function getSignalHeaders(): HeadersInit {
  if (typeof window === 'undefined') {
    return { 'Content-Type': 'application/json' };
  }

  return {
    'Content-Type': 'application/json',
    'x-signal-client-id': getOrCreateSignalClientId(window.localStorage),
  };
}

export async function fetchSignals(): Promise<{ items: SignalEvent[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals`, {
    headers: getSignalHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signals: ${response.status}`);
  }

  return response.json();
}

export async function fetchSignalAlerts(): Promise<{ items: SignalAlert[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals/alerts`, {
    headers: getSignalHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signal alerts: ${response.status}`);
  }

  return response.json();
}

export async function fetchSignalSummary(): Promise<{ summary: SignalSummary; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals/summary`, {
    headers: getSignalHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signal summary: ${response.status}`);
  }

  return response.json();
}

export async function fetchSignalHealth(): Promise<{ health: SignalHealth; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals/health`, {
    headers: getSignalHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signal health: ${response.status}`);
  }

  return response.json();
}

export async function fetchSignalPreferences(): Promise<SignalPreferences> {
  const response = await fetch(`${API_BASE}/api/signals/preferences`, {
    headers: getSignalHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signal preferences: ${response.status}`);
  }

  return response.json();
}

export async function updateSignalPreferences(input: SignalPreferences): Promise<SignalPreferences> {
  const response = await fetch(`${API_BASE}/api/signals/preferences`, {
    method: 'POST',
    headers: getSignalHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to update signal preferences: ${response.status}`);
  }

  return response.json();
}
