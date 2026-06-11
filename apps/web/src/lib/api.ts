// API client for the crypto screener backend

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  
  // Use relative URL in production (proxied by Nginx)
  return '';
};

const API_BASE = getApiBase();

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
    return fetchApi<{ success: boolean; data: any[] }>(`/market/tickers?${params}`);
  },

  getTopGainers: (limit = 50) =>
    fetchApi<{ success: boolean; data: any[] }>(`/market/tickers/top-gainers?limit=${limit}`),

  getTopLosers: (limit = 50) =>
    fetchApi<{ success: boolean; data: any[] }>(`/market/tickers/top-losers?limit=${limit}`),

  getTopVolume: (limit = 50) =>
    fetchApi<{ success: boolean; data: any[] }>(`/market/tickers/top-volume?limit=${limit}`),

  getCandles: (symbol: string, timeframe: string, exchange?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.set('timeframe', timeframe);
    if (exchange) params.set('exchange', exchange);
    if (limit) params.set('limit', String(limit));
    return fetchApi<{ success: boolean; data: any[] }>(
      `/market/candles/${symbol.replace('/', '-')}?${params}`
    );
  },

  getOrderBook: (symbol: string, exchange?: string) => {
    const params = new URLSearchParams();
    if (exchange) params.set('exchange', exchange);
    return fetchApi<{ success: boolean; data: any }>(
      `/market/orderbook/${symbol.replace('/', '-')}?${params}`
    );
  },

  getExchanges: () =>
    fetchApi<{ success: boolean; data: { all: string[]; connected: string[] } }>('/market/exchanges'),
};

// Screener API
export const screenerApi = {
  scan: (body: unknown) =>
    fetchApi<{ success: boolean; results: any[]; total: number }>('/screener/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  quick: (preset: string, exchange?: string) => {
    const params = new URLSearchParams();
    params.set('preset', preset);
    if (exchange) params.set('exchange', exchange);
    return fetchApi<{ success: boolean; results: any[]; total: number }>(`/screener/quick?${params}`);
  },
};

// Alerts API
export const alertsApi = {
  getAlerts: (params?: { type?: string; symbol?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.symbol) searchParams.set('symbol', params.symbol);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return fetchApi<{ success: boolean; alerts: any[]; total: number }>(`/alerts?${searchParams}`);
  },

  getRecent: (limit = 50) =>
    fetchApi<{ success: boolean; data: any[] }>(`/alerts/recent?limit=${limit}`),

  getUnreadCount: () =>
    fetchApi<{ success: boolean; data: { count: number } }>('/alerts/unread-count'),

  markAsRead: (id: string) =>
    fetchApi<{ success: boolean }>(`/alerts/${id}/read`, { method: 'PATCH' }),

  markAllAsRead: () =>
    fetchApi<{ success: boolean }>('/alerts/read-all', { method: 'POST' }),

  registerSignal: (signal: any) =>
    fetchApi<{ success: boolean }>('/alerts/signals', {
      method: 'POST',
      body: JSON.stringify(signal),
    }),

  unregisterSignal: (id: string) =>
    fetchApi<{ success: boolean }>(`/alerts/signals/${id}`, { method: 'DELETE' }),
};

// Patterns API
export const patternsApi = {
  getPatterns: async (params?: {
    search?: string;
    kinds?: string;
    timeframes?: string;
    statuses?: string;
    cursor?: number;
    symbol?: string;
    type?: string;
    timeframe?: string;
    status?: string;
  }) => {
    const searchParams = new URLSearchParams();

    const search = params?.search ?? params?.symbol;
    const kinds = params?.kinds ?? params?.type;
    const timeframes = params?.timeframes ?? params?.timeframe;
    const statuses = params?.statuses ?? params?.status;

    if (search) searchParams.set('search', search);
    if (kinds) searchParams.set('kinds', kinds);
    if (timeframes) searchParams.set('timeframes', timeframes);
    if (statuses) searchParams.set('statuses', statuses);
    if (params?.cursor !== undefined) searchParams.set('cursor', String(params.cursor));

    const response = await fetchApi<{
      success: boolean;
      items: any[];
      hasMore: boolean;
      nextCursor: number | null;
    }>(`/api/patterns?${searchParams}`);

    return {
      ...response,
      data: response.items,
    };
  },

  getPattern: (id: string) =>
    fetchApi<{ success: boolean; data: any | null }>(`/api/patterns/${id}`),
};

// Auth API
export const authApi = {
  telegramAuth: (telegramId: number, username?: string) =>
    fetchApi<{ success: boolean; data: { user: any; token: string } }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ telegramId, username }),
    }),

  guestAccess: () =>
    fetchApi<{ success: boolean; data: { token: string } }>('/auth/guest', { method: 'POST' }),

  getMe: (token: string) =>
    fetchApi<{ success: boolean; data: any }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),
};

// Watchlist API
export const watchlistApi = {
  getWatchlists: (token?: string) =>
    fetchApi<{ success: boolean; data: any[] }>('/watchlists', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  createWatchlist: (name: string, symbols: string[] = [], token?: string) =>
    fetchApi<{ success: boolean; data: any }>('/watchlists', {
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
