import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRangeStyle } from './range-style.ts';

test('getRangeStyle returns positive palette for upward move', () => {
  const style = getRangeStyle(5);
  assert.equal(style.direction, 'up');
  assert.match(style.fill, /rgba/);
});

test('getRangeStyle returns negative palette for downward move', () => {
  const style = getRangeStyle(-5);
  assert.equal(style.direction, 'down');
  assert.match(style.border, /rgba|#/);
});
