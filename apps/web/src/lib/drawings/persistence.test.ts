import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDrawingKind, makeInstrumentKey } from './models.ts';
import { DRAWINGS_STORAGE_KEY, loadPersistedDrawings, savePersistedDrawings } from './persistence.ts';

test('makeInstrumentKey builds exchange:marketType:symbol key', () => {
  assert.equal(makeInstrumentKey('binance', 'futures', 'BTC/USDT:USDT'), 'binance:futures:BTC/USDT:USDT');
});

test('isDrawingKind accepts supported tool kinds and rejects unknown', () => {
  assert.equal(isDrawingKind('horizontal_line'), true);
  assert.equal(isDrawingKind('rectangle'), true);
  assert.equal(isDrawingKind('fib'), false);
});

test('loadPersistedDrawings returns empty state on malformed JSON', () => {
  const storage = {
    getItem: () => '{broken}',
    setItem: () => undefined,
  } as unknown as Storage;

  const state = loadPersistedDrawings(storage);
  assert.deepEqual(state, { version: 1, drawings: [] });
});

test('loadPersistedDrawings returns empty state on incompatible payload', () => {
  const storage = {
    getItem: () => JSON.stringify({ version: 2, drawings: [{ id: 'd1' }] }),
    setItem: () => undefined,
  } as unknown as Storage;

  const state = loadPersistedDrawings(storage);
  assert.deepEqual(state, { version: 1, drawings: [] });
});

test('savePersistedDrawings writes versioned payload', () => {
  let writtenKey = '';
  let writtenValue = '';
  const storage = {
    getItem: () => null,
    setItem: (key: string, value: string) => {
      writtenKey = key;
      writtenValue = value;
    },
  } as unknown as Storage;

  savePersistedDrawings(storage, []);
  assert.equal(writtenKey, DRAWINGS_STORAGE_KEY);
  assert.match(writtenValue, /"version":1/);
  assert.match(writtenValue, /"drawings":\[\]/);
});
