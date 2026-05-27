// API client for the crypto screener backend

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}/api${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Market API
export const marketApi = {
  getTickers: (exchange?: string, symbols?: string[]) => {
    const params = new URLSearchParams();
    if (exchange) params.set('exchange', exchange);
    if (symbols?.length) params.set('symbols', symbols.join(','));
    return fetchApi<{ success: boolean; data: unknown[] }>(`/market/tickers?${params}`);
  },

  getTopGainers: (limit = 50) =>
    fetchApi<{ success: boolean; data: unknown[] }>(`/market/tickers/top-gainers?limit=${limit}`),

  getTopLosers: (limit = 50) =>
    fetchApi<{ success: boolean; data: unknown[] }>(`/market/tickers/top-losers?limit=${limit}`),

  getTopVolume: (limit = 50) =>
    fetchApi<{ success: boolean; data: unknown[] }>(`/market/tickers/top-volume?limit=${limit}`),

  getCandles: (symbol: string, timeframe: string, exchange?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.set('timeframe', timeframe);
    if (exchange) params.set('exchange', exchange);
    if (limit) params.set('limit', String(limit));
    return fetchApi<{ success: boolean; data: unknown[] }>(
      `/market/candles/${symbol.replace('/', '-')}?${params}`
    );
  },

  getOrderBook: (symbol: string, exchange?: string) => {
    const params = new URLSearchParams();
    if (exchange) params.set('exchange', exchange);
    return fetchApi<{ success: boolean; data: unknown }>(
      `/market/orderbook/${symbol.replace('/', '-')}?${params}`
    );
  },

  getExchanges: () =>
    fetchApi<{ success: boolean; data: { all: string[]; connected: string[] } }>('/market/exchanges'),
};

// Screener API
export const screenerApi = {
  scan: (body: unknown) =>
    fetchApi<{ success: boolean; results: unknown[]; total: number }>('/screener/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  quick: (preset: string, exchange?: string) => {
    const params = new URLSearchParams();
    params.set('preset', preset);
    if (exchange) params.set('exchange', exchange);
    return fetchApi<{ success: boolean; results: unknown[]; total: number }>(`/screener/quick?${params}`);
  },
};

// Alerts API
export const alertsApi = {
  getAlerts: (params?: { type?: string; symbol?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.symbol) searchParams.set('symbol', params.symbol);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return fetchApi<{ success: boolean; alerts: unknown[]; total: number }>(`/alerts?${searchParams}`);
  },

  getRecent: (limit = 50) =>
    fetchApi<{ success: boolean; data: unknown[] }>(`/alerts/recent?limit=${limit}`),

  getUnreadCount: () =>
    fetchApi<{ success: boolean; data: { count: number } }>('/alerts/unread-count'),

  markAsRead: (id: string) =>
    fetchApi<{ success: boolean }>(`/alerts/${id}/read`, { method: 'PATCH' }),

  markAllAsRead: () =>
    fetchApi<{ success: boolean }>('/alerts/read-all', { method: 'POST' }),
};

// Patterns API
export const patternsApi = {
  getPatterns: (params?: { symbol?: string; type?: string; timeframe?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.symbol) searchParams.set('symbol', params.symbol);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.timeframe) searchParams.set('timeframe', params.timeframe);
    return fetchApi<{ success: boolean; data: unknown[] }>(`/patterns?${searchParams}`);
  },

  getActive: () =>
    fetchApi<{ success: boolean; data: unknown[] }>('/patterns/active'),
};

// Auth API
export const authApi = {
  telegramAuth: (telegramId: number, username?: string) =>
    fetchApi<{ success: boolean; data: { user: unknown; token: string } }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ telegramId, username }),
    }),

  guestAccess: () =>
    fetchApi<{ success: boolean; data: { token: string } }>('/auth/guest', { method: 'POST' }),

  getMe: (token: string) =>
    fetchApi<{ success: boolean; data: unknown }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),
};

// Watchlist API
export const watchlistApi = {
  getWatchlists: (token?: string) =>
    fetchApi<{ success: boolean; data: unknown[] }>('/watchlists', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  createWatchlist: (name: string, symbols: string[] = [], token?: string) =>
    fetchApi<{ success: boolean; data: unknown }>('/watchlists', {
      method: 'POST',
      body: JSON.stringify({ name, symbols }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  addSymbol: (id: string, symbol: string) =>
    fetchApi<{ success: boolean }>(`/watchlists/${id}/symbols`, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),

  removeSymbol: (id: string, symbol: string) =>
    fetchApi<{ success: boolean }>(`/watchlists/${id}/symbols/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    }),
};
