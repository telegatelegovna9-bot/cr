import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectMissingCandleRange,
  getInitialHistoryBackfillEndTime,
  mergeChartHistory,
  shouldBackfillInitialHistory,
} from './chart-history';

test('requests initial backfill when only a live candle was seeded', () => {
  const liveOnly = [{ time: 1_000_000, open: 1, high: 2, low: 1, close: 2, volume: 10 }];

  assert.equal(shouldBackfillInitialHistory(liveOnly, 300), true);
  assert.equal(getInitialHistoryBackfillEndTime(liveOnly), 999_999);
});

test('does not request initial backfill when REST already loaded enough history', () => {
  const history = Array.from({ length: 300 }, (_, i) => ({
    time: 1_000_000 + i * 60_000,
    open: 1,
    high: 2,
    low: 1,
    close: 2,
    volume: 10,
  }));

  assert.equal(shouldBackfillInitialHistory(history, 300), false);
});

test('merges older history before live candles and removes duplicates by time', () => {
  const liveOnly = [{ time: 180_000, open: 3, high: 4, low: 3, close: 4, volume: 30 }];
  const older = [
    { time: 60_000, open: 1, high: 2, low: 1, close: 2, volume: 10 },
    { time: 120_000, open: 2, high: 3, low: 2, close: 3, volume: 20 },
    { time: 180_000, open: 9, high: 9, low: 9, close: 9, volume: 99 },
  ];

  const merged = mergeChartHistory(older, liveOnly);

  assert.deepEqual(merged.map(c => c.time), [60_000, 120_000, 180_000]);
  assert.equal(merged[2].close, 4);
});

test('detects no missing candle range when incoming candle is the next bucket', () => {
  const range = detectMissingCandleRange(
    { time: 1_000_000 },
    { time: 1_060_000 },
    '1m',
  );

  assert.equal(range, null);
});

test('detects missing candle range when incoming candle jumps forward by multiple buckets', () => {
  const range = detectMissingCandleRange(
    { time: 1_000_000 },
    { time: 1_180_000 },
    '1m',
  );

  assert.deepEqual(range, {
    startTime: 1_020_000,
    endTime: 1_139_999,
    missingBuckets: 2,
  });
});
