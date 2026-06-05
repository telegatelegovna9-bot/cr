import type { Timeframe } from '@crypto-screener/shared';

export const MARKET_PREFERENCES_STORAGE_KEY = 'aionui.market-preferences.v1';
export const DEFAULT_MARKET_TIMEFRAME: Timeframe = '1h';

interface MarketPreferencesState {
  selectedTimeframe: Timeframe;
}

function isValidTimeframe(value: unknown): value is Timeframe {
  return value === '1m' || value === '5m' || value === '15m' || value === '1h' || value === '4h' || value === '1d' || value === '1w';
}

export function loadPersistedMarketPreferences(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): MarketPreferencesState {
  if (!storage) {
    return { selectedTimeframe: DEFAULT_MARKET_TIMEFRAME };
  }

  const raw = storage.getItem(MARKET_PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return { selectedTimeframe: DEFAULT_MARKET_TIMEFRAME };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MarketPreferencesState>;
    return {
      selectedTimeframe: isValidTimeframe(parsed.selectedTimeframe)
        ? parsed.selectedTimeframe
        : DEFAULT_MARKET_TIMEFRAME,
    };
  } catch {
    return { selectedTimeframe: DEFAULT_MARKET_TIMEFRAME };
  }
}

export function savePersistedMarketPreferences(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  state: MarketPreferencesState,
): MarketPreferencesState {
  if (!storage) {
    return state;
  }

  storage.setItem(MARKET_PREFERENCES_STORAGE_KEY, JSON.stringify(state));
  return state;
}
