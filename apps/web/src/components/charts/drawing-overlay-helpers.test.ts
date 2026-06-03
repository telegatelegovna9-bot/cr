import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLocalOverlayPoint, panLogicalRange } from './drawing-overlay-helpers';

test('getLocalOverlayPoint scales client coordinates into overlay space', () => {
  const point = getLocalOverlayPoint(
    250,
    160,
    { left: 100, top: 50, width: 300, height: 150 },
    600,
    300,
  );

  assert.deepEqual(point, { x: 300, y: 220 });
});

test('panLogicalRange shifts visible range by drag distance', () => {
  const nextRange = panLogicalRange({ from: 100, to: 200 }, 50, 500);

  assert.deepEqual(nextRange, { from: 90, to: 190 });
});

test('panLogicalRange returns null without a valid range', () => {
  assert.equal(panLogicalRange(null, 50, 500), null);
  assert.equal(panLogicalRange({ from: 100, to: 200 }, 50, 0), null);
});
