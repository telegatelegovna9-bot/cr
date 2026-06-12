import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  shouldRefreshLatestHistoryOnResume,
  shouldStartFreshHistorySession,
} from './chart-history';

test('refreshes history when the chart view becomes active again', () => {
  assert.equal(
    shouldRefreshLatestHistoryOnResume({
      dataLoaded: true,
      paused: false,
      wasViewActive: false,
      isViewActive: true,
      wasConnected: true,
      isConnected: true,
    }),
    true,
  );
});

test('refreshes history when websocket reconnects while chart is active', () => {
  assert.equal(
    shouldRefreshLatestHistoryOnResume({
      dataLoaded: true,
      paused: false,
      wasViewActive: true,
      isViewActive: true,
      wasConnected: false,
      isConnected: true,
    }),
    true,
  );
});

test('does not refresh history while paused or before data is loaded', () => {
  assert.equal(
    shouldRefreshLatestHistoryOnResume({
      dataLoaded: false,
      paused: false,
      wasViewActive: false,
      isViewActive: true,
      wasConnected: false,
      isConnected: true,
    }),
    false,
  );
  assert.equal(
    shouldRefreshLatestHistoryOnResume({
      dataLoaded: true,
      paused: true,
      wasViewActive: false,
      isViewActive: true,
      wasConnected: false,
      isConnected: true,
    }),
    false,
  );
});

test('starts a fresh history session when chart view becomes active again', () => {
  assert.equal(
    shouldStartFreshHistorySession({
      wasViewActive: false,
      isViewActive: true,
      previousMarketType: 'spot',
      marketType: 'spot',
      previousExchange: 'binance',
      exchange: 'binance',
    }),
    true,
  );
});

test('starts a fresh history session when market type changes', () => {
  assert.equal(
    shouldStartFreshHistorySession({
      wasViewActive: true,
      isViewActive: true,
      previousMarketType: 'spot',
      marketType: 'futures',
      previousExchange: 'binance',
      exchange: 'binance',
    }),
    true,
  );
});

test('does not start a fresh history session without a real context transition', () => {
  assert.equal(
    shouldStartFreshHistorySession({
      wasViewActive: true,
      isViewActive: true,
      previousMarketType: 'spot',
      marketType: 'spot',
      previousExchange: 'binance',
      exchange: 'binance',
    }),
    false,
  );
});
