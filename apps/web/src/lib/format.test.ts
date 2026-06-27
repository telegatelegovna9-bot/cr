import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHART_PRICE_SCALE_MIN_WIDTH,
  getChartPriceFormat,
  mergeChartPriceFormat,
} from './format.ts';

test('mergeChartPriceFormat preserves the widest precision already seen', () => {
  const initial = getChartPriceFormat(0.995);
  const next = mergeChartPriceFormat(initial, 1.0023);

  assert.equal(initial.precision, 5);
  assert.equal(next.precision, 5);
  assert.equal(next.minMove, 0.00001);
});

test('mergeChartPriceFormat increases precision when a later price needs more detail', () => {
  const initial = getChartPriceFormat(1200.12);
  const next = mergeChartPriceFormat(initial, 0.00045678);

  assert.equal(initial.precision, 2);
  assert.equal(next.precision, 8);
  assert.equal(next.minMove, 0.00000001);
});

test('chart price scale minimum width remains fixed for stable layout', () => {
  assert.equal(CHART_PRICE_SCALE_MIN_WIDTH, 72);
});
