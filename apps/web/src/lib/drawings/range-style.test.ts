import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRangeStyle } from './range-style.ts';

test('getRangeStyle returns positive palette for upward move', () => {
  const style = getRangeStyle(5);
  assert.deepEqual(style, {
    direction: 'up',
    fill: 'rgba(59, 130, 246, 0.16)',
    border: 'rgba(59, 130, 246, 0.9)',
    line: 'rgba(59, 130, 246, 0.95)',
    textBg: 'rgba(30, 64, 175, 0.95)',
    textFg: '#dbeafe',
    handle: '#3b82f6',
  });
});

test('getRangeStyle returns negative palette for downward move', () => {
  const style = getRangeStyle(-5);
  assert.deepEqual(style, {
    direction: 'down',
    fill: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.9)',
    line: 'rgba(239, 68, 68, 0.95)',
    textBg: 'rgba(127, 29, 29, 0.95)',
    textFg: '#fee2e2',
    handle: '#ef4444',
  });
});
