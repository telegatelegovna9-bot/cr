import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deserializeScreenerPreset, serializeScreenerPreset } from './screener-presets.ts';

test('screener presets round-trip local persistence payloads', () => {
  const raw = serializeScreenerPreset({
    id: 'p1',
    name: 'Momentum',
    marketType: 'spot',
    exchanges: ['binance'],
    soundEnabled: true,
    filters: { exchanges: ['binance'], metrics: { changePct: { timeframe: '1m', min: 1.5 } } },
    createdAt: 1,
    updatedAt: 2,
  });

  const preset = deserializeScreenerPreset(raw);
  assert.equal(preset.name, 'Momentum');
  assert.equal(preset.soundEnabled, true);
  assert.deepEqual(preset.filters.metrics.changePct, { timeframe: '1m', min: 1.5 });
});
