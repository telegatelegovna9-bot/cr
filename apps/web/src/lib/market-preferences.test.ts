import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MARKET_TIMEFRAME,
  MARKET_PREFERENCES_STORAGE_KEY,
  loadPersistedMarketPreferences,
  savePersistedMarketPreferences,
} from './market-preferences.ts';

function createStorageMock(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('loadPersistedMarketPreferences returns default timeframe when storage is empty', () => {
  const storage = createStorageMock();
  const state = loadPersistedMarketPreferences(storage);

  assert.equal(state.selectedTimeframe, DEFAULT_MARKET_TIMEFRAME);
});

test('savePersistedMarketPreferences stores selected timeframe', () => {
  const storage = createStorageMock();
  savePersistedMarketPreferences(storage, { selectedTimeframe: '15m' });

  assert.deepEqual(JSON.parse(storage.getItem(MARKET_PREFERENCES_STORAGE_KEY) ?? '{}'), {
    selectedTimeframe: '15m',
  });
});

test('loadPersistedMarketPreferences falls back for malformed timeframe', () => {
  const storage = createStorageMock({
    [MARKET_PREFERENCES_STORAGE_KEY]: JSON.stringify({ selectedTimeframe: 'bad' }),
  });
  const state = loadPersistedMarketPreferences(storage);

  assert.equal(state.selectedTimeframe, DEFAULT_MARKET_TIMEFRAME);
});
