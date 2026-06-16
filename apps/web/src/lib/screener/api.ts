import type {
  ScreenerCompatibleSummaryResponse,
  ScreenerEventDetailResponse,
  ScreenerEventListResponse,
  ScreenerHealth,
  ScreenerRow,
  ScreenerSummary,
} from './models';
import { getScreenerDetailEndpoint, getScreenerEndpoint, type ScreenerMode } from './models';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

async function fetchScreenerJson<T>(path: string, errorLabel: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${errorLabel}: ${response.status}`);
  }

  return response.json();
}

export async function fetchScreener(): Promise<{ items: ScreenerRow[]; timestamp: number }> {
  return fetchScreenerJson('/api/screener', 'screener rows');
}

export async function fetchScreenerFeed(mode: ScreenerMode = 'best-setups'): Promise<ScreenerEventListResponse> {
  return fetchScreenerJson(getScreenerEndpoint(mode), `${mode} screener feed`);
}

export async function fetchScreenerDetail(id: string): Promise<ScreenerEventDetailResponse> {
  return fetchScreenerJson(getScreenerDetailEndpoint(id), 'screener detail');
}

export async function fetchScreenerSummary(): Promise<{ summary: ScreenerSummary; timestamp: number }> {
  return fetchScreenerJson('/api/screener/summary', 'screener summary');
}

export async function fetchCompatibleScreenerSummary(): Promise<ScreenerCompatibleSummaryResponse> {
  return fetchScreenerJson('/api/screener/summary', 'compatible screener summary');
}

export async function fetchScreenerHealth(): Promise<{ health: ScreenerHealth; timestamp: number }> {
  return fetchScreenerJson('/api/screener/health', 'screener health');
}
