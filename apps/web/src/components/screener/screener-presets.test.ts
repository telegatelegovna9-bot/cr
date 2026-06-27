import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deserializeScreenerPreset, serializeScreenerPreset } from './screener-presets.ts';

test('screener presets round-trip local persistence payloads', () => {
  const raw = serializeScreenerPreset({
    id: 'p1',
    name: 'Momentum',
    marketType: 'spot',
    soundEnabled: true,
    filters: { exchanges: ['binance'], metrics: { changePct: { timeframe: '1m', min: 1.5 } } },
    createdAt: 1,
    updatedAt: 2,
  });

  const preset = deserializeScreenerPreset(raw);
  assert.ok(preset);
  assert.equal(preset.name, 'Momentum');
  assert.equal(preset.soundEnabled, true);
  assert.deepEqual(preset.filters.metrics.changePct, { timeframe: '1m', min: 1.5 });
});

test('deserializeScreenerPreset normalizes legacy exchanges and rejects invalid payloads', () => {
  const legacy = JSON.stringify({
    id: 'p2',
    name: 'Legacy',
    marketType: 'futures',
    exchanges: ['bybit', 'bybit'],
    soundEnabled: false,
    filters: { exchanges: ['binance'], metrics: { changePct: { timeframe: '5m', min: 2 } } },
    createdAt: 3,
    updatedAt: 4,
  });

  const normalized = deserializeScreenerPreset(legacy);
  assert.ok(normalized);
  assert.deepEqual(normalized.filters.exchanges, ['binance']);

  assert.equal(deserializeScreenerPreset('{'), null);
  assert.equal(
    deserializeScreenerPreset(
      JSON.stringify({
        id: 'p3',
        name: 'Broken',
        marketType: 'oops',
        soundEnabled: true,
        filters: { exchanges: ['binance'], metrics: {} },
        createdAt: 1,
        updatedAt: 2,
      }),
    ),
    null,
  );
  assert.equal(
    deserializeScreenerPreset(
      JSON.stringify({
        id: 'p4',
        name: 'Broken timeframe',
        marketType: 'spot',
        soundEnabled: true,
        filters: { exchanges: ['binance'], metrics: { changePct: { timeframe: '2m', min: 1 } } },
        createdAt: 1,
        updatedAt: 2,
      }),
    ),
    null,
  );
});
