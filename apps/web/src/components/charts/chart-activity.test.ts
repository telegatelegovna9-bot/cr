import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isChartRealtimeActive,
  isTerminalChartGridActive,
} from './chart-activity.ts';

test('disables realtime chart work when the view is inactive', () => {
  assert.equal(
    isChartRealtimeActive({
      paused: false,
      isViewActive: false,
    }),
    false,
  );
});

test('disables realtime chart work when the chart is paused', () => {
  assert.equal(
    isChartRealtimeActive({
      paused: true,
      isViewActive: true,
    }),
    false,
  );
});

test('keeps realtime chart work active only when chart is visible and not paused', () => {
  assert.equal(
    isChartRealtimeActive({
      paused: false,
      isViewActive: true,
    }),
    true,
  );
});

test('suspends the terminal grid while the coin chart modal is open', () => {
  assert.equal(
    isTerminalChartGridActive({
      viewMode: 'terminal',
      coinChartModalOpen: true,
    }),
    false,
  );
});

test('keeps the terminal grid active when no coin chart modal is open', () => {
  assert.equal(
    isTerminalChartGridActive({
      viewMode: 'terminal',
      coinChartModalOpen: false,
    }),
    true,
  );
});
