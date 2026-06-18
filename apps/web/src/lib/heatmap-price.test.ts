import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHeatmapPriceStep, resolveHeatmapReferencePrice } from './heatmap-price.ts';

test('uses ticker price first for heatmap reference price', () => {
  const price = resolveHeatmapReferencePrice({
    tickerPrice: 62500,
    candlePrice: 62450,
    orderbook: {
      bids: [{ price: 62490, quantity: 1 }],
      asks: [{ price: 62510, quantity: 1 }],
    },
  });

  assert.equal(price, 62500);
});

test('falls back to orderbook midpoint when ticker and candle price are unavailable', () => {
  const price = resolveHeatmapReferencePrice({
    tickerPrice: 0,
    candlePrice: null,
    orderbook: {
      bids: [{ price: 1702.4, quantity: 1 }],
      asks: [{ price: 1702.8, quantity: 1 }],
    },
  });

  assert.equal(price, 1702.6);
});

test('computes large-instrument bucket steps from actual reference price', () => {
  assert.equal(getHeatmapPriceStep(62938), 10);
  assert.equal(getHeatmapPriceStep(1702.91), 1);
  assert.equal(getHeatmapPriceStep(69.31), 0.01);
});
