import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseScreenerMode,
  type ScreenerEvent,
  type ScreenerMode,
} from './models';

// Keep this file focused on the web-facing mode parser and shared screener event contract.
test('parseScreenerMode falls back to best-setups for unknown values', () => {
  assert.equal(parseScreenerMode('noise'), 'best-setups');
  assert.equal(parseScreenerMode(' futures '), 'futures');
  assert.equal(parseScreenerMode('spot'), 'spot');
  assert.equal(parseScreenerMode('futures'), 'futures');
  assert.equal(parseScreenerMode('best-setups'), 'best-setups');
});

test('ScreenerEvent uses the event-oriented contract', () => {
  const mode: ScreenerMode = 'best-setups';
  const event: ScreenerEvent = {
    id: 'btc-spot-breakout',
    symbol: 'BTC/USDT',
    marketMode: 'spot',
    detectorType: 'spot-breakout-pressure',
    promotionTier: 'rare',
    strengthTier: 'event-live',
    headline: 'BTC breakout pressure is building',
    reason: 'Volume and range expanded together on the primary venue.',
    riskNote: 'Fades quickly if the breakout loses spot volume support.',
    primaryExchange: 'binance',
    chartTimeframe: '5m',
    supportingMetrics: {
      priceChange5mPct: 4.2,
      volumeSpikeRatio: 3.1,
      openInterestChangePct: null,
    },
    confirms: ['Spot volume keeps accelerating', 'Price holds above the range high'],
    invalidates: ['Breakout snaps back into the prior range'],
    updatedAt: 1_718_500_000_000,
  };

  assert.equal(mode, 'best-setups');
  assert.equal(event.marketMode, 'spot');
  assert.equal(event.detectorType, 'spot-breakout-pressure');
  assert.equal(event.promotionTier, 'rare');
  assert.equal(event.strengthTier, 'event-live');
});
