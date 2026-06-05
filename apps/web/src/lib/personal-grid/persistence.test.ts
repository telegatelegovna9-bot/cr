import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PERSONAL_GRID_STATE,
  createEmptyPersonalGridState,
} from './models';
import {
  PERSONAL_GRID_STORAGE_KEY,
  loadPersistedPersonalGrid,
  savePersistedPersonalGrid,
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

test('createEmptyPersonalGridState returns six empty slots', () => {
  const state = createEmptyPersonalGridState();

  assert.equal(state.layout, 4);
  assert.equal(state.expandedSlotId, null);
  assert.equal(state.slots.length, 6);
  assert.equal(state.slots.every(slot => slot.symbol === null), true);
});

test('loadPersistedPersonalGrid returns defaults when storage is empty', () => {
  const storage = createStorageMock();
  const state = loadPersistedPersonalGrid(storage);

  assert.deepEqual(state, DEFAULT_PERSONAL_GRID_STATE);
});

test('savePersistedPersonalGrid stores serializable grid state', () => {
  const storage = createStorageMock();
  const state = {
    layout: 6 as const,
    expandedSlotId: 'slot-2',
    slots: createEmptyPersonalGridState().slots.map((slot, index) =>
      index === 1
        ? { ...slot, symbol: 'BTC/USDT', exchange: 'binance', marketType: 'spot' as const }
        : slot,
    ),
  };

  savePersistedPersonalGrid(storage, state);
  const raw = storage.getItem(PERSONAL_GRID_STORAGE_KEY);

  assert.ok(raw);
  assert.deepEqual(JSON.parse(raw!), state);
});

test('loadPersistedPersonalGrid falls back to defaults for malformed data', () => {
  const storage = createStorageMock({
    [PERSONAL_GRID_STORAGE_KEY]: JSON.stringify({ bad: true }),
  });

  const state = loadPersistedPersonalGrid(storage);
  assert.deepEqual(state, DEFAULT_PERSONAL_GRID_STATE);
});
