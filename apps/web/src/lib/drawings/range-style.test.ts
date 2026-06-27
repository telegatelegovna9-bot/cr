import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRangeStyle } from './range-style.ts';

test('getRangeStyle returns positive palette for upward move', () => {
  const style = getRangeStyle(5);
  assert.deepEqual(style, {
    direction: 'up',
    fill: 'rgba(34, 197, 94, 0.18)',
    border: 'rgba(34, 197, 94, 0.95)',
    line: 'rgba(34, 197, 94, 1)',
    textBg: 'rgba(21, 128, 61, 0.96)',
    textFg: '#ffffff',
    handle: '#ffffff',
  });
});

test('getRangeStyle returns negative palette for downward move', () => {
  const style = getRangeStyle(-5);
  assert.deepEqual(style, {
    direction: 'down',
    fill: 'rgba(239, 68, 68, 0.18)',
    border: 'rgba(239, 68, 68, 0.95)',
    line: 'rgba(239, 68, 68, 1)',
    textBg: 'rgba(185, 28, 28, 0.96)',
    textFg: '#ffffff',
    handle: '#ffffff',
  });
});
