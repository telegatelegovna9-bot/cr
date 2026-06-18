import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type HeatmapSummarySnapshot,
  shouldCommitHeatmapSummary,
} from './heatmap-summary-state.ts';

const baseSummary: HeatmapSummarySnapshot = {
  barrier: { price: 100, usd: 200_000 },
  topAbove: { price: 102, usd: 180_000 },
  topBelow: { price: 98, usd: 150_000 },
  bias: 'balanced',
  upPath: 'mixed',
  downPath: 'blocked',
};

test('commits the first heatmap summary immediately', () => {
  assert.equal(
    shouldCommitHeatmapSummary({
      previous: null,
      next: baseSummary,
      lastCommittedAt: 0,
      now: 1000,
      minIntervalMs: 400,
    }),
    true,
  );
});

test('skips unchanged heatmap summaries even after the interval passes', () => {
  assert.equal(
    shouldCommitHeatmapSummary({
      previous: baseSummary,
      next: { ...baseSummary },
      lastCommittedAt: 1000,
      now: 1600,
      minIntervalMs: 400,
    }),
    false,
  );
});

test('throttles changed heatmap summaries until the minimum interval passes', () => {
  const changed: HeatmapSummarySnapshot = {
    ...baseSummary,
    bias: 'pull up',
  };

  assert.equal(
    shouldCommitHeatmapSummary({
      previous: baseSummary,
      next: changed,
      lastCommittedAt: 1000,
      now: 1200,
      minIntervalMs: 400,
    }),
    false,
  );
});

test('commits changed heatmap summaries after the minimum interval passes', () => {
  const changed: HeatmapSummarySnapshot = {
    ...baseSummary,
    barrier: { price: 101, usd: 240_000 },
  };

  assert.equal(
    shouldCommitHeatmapSummary({
      previous: baseSummary,
      next: changed,
      lastCommittedAt: 1000,
      now: 1500,
      minIntervalMs: 400,
    }),
    true,
  );
});
