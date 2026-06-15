import assert from 'node:assert/strict';
// @ts-expect-error Node test runner resolves the local TypeScript module via explicit extension.
import { normalizePatternGeometry } from './geometry-normalizer.ts';
import type { PatternGeometry } from './patterns.types';

const unsortedTriangle: PatternGeometry = {
  anchorTimeFrom: 50,
  anchorTimeTo: 150,
  priceMin: 12,
  priceMax: 18,
  pivots: [
    { time: 140, price: 15 },
    { time: 100, price: 16 },
    { time: 120, price: 14 },
  ],
  lines: [
    {
      kind: 'segment',
      points: [
        { time: 150, price: 17 },
        { time: 90, price: 18 },
      ],
    },
  ],
  zones: [
    {
      fromTime: 130,
      toTime: 90,
      low: 16,
      high: 14,
    },
  ],
};

const normalizedTriangle = normalizePatternGeometry('triangle', unsortedTriangle);
assert.deepEqual(
  normalizedTriangle.pivots.map((point: { time: number }) => point.time),
  [100, 120, 140],
);
assert.equal(normalizedTriangle.lines[0]?.points[0].time, 90);
assert.equal(normalizedTriangle.lines[0]?.points[1].time, 150);
assert.equal(normalizedTriangle.zones.length, 0);
assert.equal(normalizedTriangle.anchorTimeFrom, 90);
assert.equal(normalizedTriangle.anchorTimeTo, 150);
assert.equal(normalizedTriangle.priceMin <= 14, true);
assert.equal(normalizedTriangle.priceMax >= 18, true);

const fvgGeometry: PatternGeometry = {
  anchorTimeFrom: 100,
  anchorTimeTo: 120,
  priceMin: 1,
  priceMax: 2,
  pivots: [],
  lines: [],
  zones: [
    {
      fromTime: 120,
      toTime: 110,
      low: 2.1,
      high: 1.9,
    },
  ],
};

const normalizedFvg = normalizePatternGeometry('fvg', fvgGeometry);
assert.deepEqual(normalizedFvg.zones, [
  {
    fromTime: 110,
    toTime: 120,
    low: 1.9,
    high: 2.1,
  },
]);
