import assert from 'node:assert/strict';
import { test } from 'node:test';
import { 
  projectHorizontalLine, 
  projectTrendline,
  projectVerticalLine,
  projectRectangle,
  projectRangeBox,
  hitTestLine,
  hitTestPoint,
  hitTestRectangleHandle 
} from './engine.ts';

test('projectHorizontalLine returns full-width line for visible price', () => {
  const line = projectHorizontalLine(
    { price: 100 } as any, 
    { width: 400, priceToY: (p) => p === 100 ? 120 : null } as any
  );
  assert.deepEqual(line, { x1: 0, y1: 120, x2: 400, y2: 120 });
});

test('projectVerticalLine returns full-height line for visible time', () => {
  const line = projectVerticalLine(
    { time: 1000 } as any, 
    { height: 300, timeToX: (t) => t === 1000 ? 50 : null } as any
  );
  assert.deepEqual(line, { x1: 50, y1: 0, x2: 50, y2: 300 });
});

test('projectTrendline returns line between two points', () => {
  const line = projectTrendline(
    { p1: { time: 10, price: 100 }, p2: { time: 20, price: 200 } } as any,
    { 
      timeToX: (t) => t === 10 ? 100 : (t === 20 ? 200 : null),
      priceToY: (p) => p === 100 ? 50 : (p === 200 ? 150 : null)
    } as any
  );
  assert.deepEqual(line, { x1: 100, y1: 50, x2: 200, y2: 150 });
});

test('projectRangeBox returns bounds and center points for ruler geometry', () => {
  const box = projectRangeBox(
    { p1: { time: 10, price: 100 }, p2: { time: 20, price: 120 } } as any,
    {
      width: 400,
      height: 300,
      timeToX: (time: number) => (time === 10 ? 100 : (time === 20 ? 200 : null)),
      logicalToX: () => null,
      lastRealLogical: null,
      priceToY: (price: number) => (price === 100 ? 220 : (price === 120 ? 120 : null)),
    } as any,
  );

  assert.deepEqual(box, {
    x: 100,
    y: 120,
    width: 100,
    height: 100,
    x1: 100,
    y1: 220,
    x2: 200,
    y2: 120,
    midX: 150,
    midY: 170,
  });
});

test('hitTestRectangleHandle detects near-corner hit', () => {
  const hit = hitTestRectangleHandle({ x: 10, y: 10, handleX: 12, handleY: 9, radius: 6 });
  assert.equal(hit, true);
  
  const miss = hitTestRectangleHandle({ x: 10, y: 10, handleX: 20, handleY: 20, radius: 6 });
  assert.equal(miss, false);
});

test('hitTestPoint detects hit within radius', () => {
  assert.equal(hitTestPoint(10, 10, 12, 11, 5), true);
  assert.equal(hitTestPoint(10, 10, 20, 20, 5), false);
});

test('hitTestLine detects hit near segment', () => {
  // Point (5, 5) near line (0,0) to (10,10)
  assert.equal(hitTestLine(5, 5, 0, 0, 10, 10, 5), true);
  // Point (0, 10) far from line (0,0) to (10,10)
  assert.equal(hitTestLine(0, 10, 0, 0, 10, 10, 2), false);
});
