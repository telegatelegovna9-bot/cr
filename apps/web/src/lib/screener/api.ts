import type { ScreenerHealth, ScreenerRow, ScreenerSummary } from './models';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

export async function fetchScreener(): Promise<{ items: ScreenerRow[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/screener`);

  if (!response.ok) {
    throw new Error(`Failed to fetch screener rows: ${response.status}`);
  }

  return response.json();
}

export async function fetchScreenerSummary(): Promise<{ summary: ScreenerSummary; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/screener/summary`);

  if (!response.ok) {
    throw new Error(`Failed to fetch screener summary: ${response.status}`);
  }

  return response.json();
}

export async function fetchScreenerHealth(): Promise<{ health: ScreenerHealth; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/screener/health`);

  if (!response.ok) {
    throw new Error(`Failed to fetch screener health: ${response.status}`);
  }

  return response.json();
}
