import type { SignalAlert, SignalEvent } from './models';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

export async function fetchSignals(): Promise<{ items: SignalEvent[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signals: ${response.status}`);
  }

  return response.json();
}

export async function fetchSignalAlerts(): Promise<{ items: SignalAlert[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals/alerts`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signal alerts: ${response.status}`);
  }

  return response.json();
}
