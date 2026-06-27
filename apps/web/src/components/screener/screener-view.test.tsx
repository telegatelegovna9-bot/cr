import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScreenerView } from './screener-view';

test('ScreenerView renders header and result scaffolding', () => {
  const html = renderToStaticMarkup(React.createElement(ScreenerView));
  assert.match(html, /Market Screener/);
  assert.match(html, /Spot/);
  assert.match(html, /Futures/);
});
