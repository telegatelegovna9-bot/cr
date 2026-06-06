import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiquidityBuckets,
  createBucketWindow,
  mergeBookSideIntoBuckets,
} from './liquidity-buckets';
import { LiquidityEngine } from './liquidity-engine';

test('createBucketWindow limits rendering to a bounded price distance from current price', () => {
  const window = createBucketWindow({ currentPrice: 100, depthPct: 0.05 });
  assert.deepEqual(window, { minPrice: 95, maxPrice: 105 });
});

test('mergeBookSideIntoBuckets aggregates multiple levels into the same price bucket', () => {
  const buckets = new Map<number, number>();
  mergeBookSideIntoBuckets({
    buckets,
    levels: [
      { price: 100.01, quantity: 3 },
      { price: 100.04, quantity: 2 },
    ],
    bucketSize: 0.1,
  });

  assert.equal(buckets.size, 1);
  assert.equal(buckets.get(100.0), 5);
});

test('buildLiquidityBuckets returns sorted background bands for visible price window only', () => {
  const bands = buildLiquidityBuckets({
    bids: [
      { price: 99.9, quantity: 4 },
      { price: 92, quantity: 99 },
    ],
    asks: [
      { price: 100.2, quantity: 5 },
      { price: 108, quantity: 77 },
    ],
    currentPrice: 100,
    bucketSize: 0.1,
    depthPct: 0.02,
  });

  assert.deepEqual(
    bands.map(b => b.price),
    [99.9, 100.2],
  );
});

test('LiquidityEngine exposes background bands and key levels separately', () => {
  const engine = new LiquidityEngine();
  engine.setPriceStep(0.1);
  engine.addUpdate(
    [{ price: 99.9, quantity: 8 }],
    [{ price: 100.6, quantity: 12 }],
    100,
    1_000,
  );

  const model = engine.getRenderModel({
    currentPrice: 100,
    depthPct: 0.03,
    minSizeUsd: 0,
    intensity: 1,
    diagnosticsEnabled: false,
  });

  assert.equal(model.backgroundBands.length > 0, true);
  assert.equal(model.keyLevels.length > 0, true);
  assert.equal(model.diagnostics.length, 0);
});
