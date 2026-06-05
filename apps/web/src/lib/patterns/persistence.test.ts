import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PATTERNS_UI_STATE,
  type PatternsUIState,
} from './models';
import {
  PATTERNS_UI_STORAGE_KEY,
  loadPersistedPatternsUIState,
  savePersistedPatternsUIState,
} from './persistence';

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

test('loadPersistedPatternsUIState returns defaults when storage is empty', () => {
  const state = loadPersistedPatternsUIState(createStorageMock());
  assert.deepEqual(state, DEFAULT_PATTERNS_UI_STATE);
});

test('savePersistedPatternsUIState stores filters, search, and selected pattern id', () => {
  const storage = createStorageMock();
  const state: PatternsUIState = {
    search: 'BTC',
    selectedPatternId: 'p-1',
    filters: {
      kinds: ['triangle'],
      timeframes: ['15m'],
      statuses: ['confirmed'],
    },
  };

  savePersistedPatternsUIState(storage, state);
  assert.deepEqual(JSON.parse(storage.getItem(PATTERNS_UI_STORAGE_KEY) ?? '{}'), state);
});

test('loadPersistedPatternsUIState falls back to defaults for malformed payload', () => {
  const storage = createStorageMock({
    [PATTERNS_UI_STORAGE_KEY]: JSON.stringify({ search: 42 }),
  });

  const state = loadPersistedPatternsUIState(storage);
  assert.deepEqual(state, DEFAULT_PATTERNS_UI_STATE);
});
