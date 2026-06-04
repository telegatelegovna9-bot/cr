import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiquiditySignals,
  summarizeLiquidityBias,
} from './liquidity-signals';

test('buildLiquiditySignals finds strongest levels above and below price', () => {
  const signals = buildLiquiditySignals({
    currentPrice: 100,
    bands: [
      { price: 99.5, usd: 400_000, side: 'bid', intensity: 0.8 },
      { price: 98.8, usd: 120_000, side: 'bid', intensity: 0.4 },
      { price: 100.8, usd: 900_000, side: 'ask', intensity: 1.0 },
      { price: 101.4, usd: 250_000, side: 'ask', intensity: 0.5 },
    ],
  });

  assert.equal(signals.topAbove?.price, 100.8);
  assert.equal(signals.topBelow?.price, 99.5);
  assert.equal(signals.nearestMagnet?.price, 100.8);
});

test('summarizeLiquidityBias reports pull-up when upper liquidity dominates nearby lower liquidity', () => {
  const bias = summarizeLiquidityBias({
    currentPrice: 100,
    topAbove: { price: 100.5, usd: 1_000_000 },
    topBelow: { price: 99.7, usd: 200_000 },
  });

  assert.equal(bias, 'pull up');
});

test('buildLiquiditySignals detects a liquidity gap between dense regions', () => {
  const signals = buildLiquiditySignals({
    currentPrice: 100,
    bands: [
      { price: 99.8, usd: 700_000, side: 'bid', intensity: 0.9 },
      { price: 100.9, usd: 800_000, side: 'ask', intensity: 1.0 },
    ],
  });

  assert.equal(signals.gaps.length > 0, true);
});
