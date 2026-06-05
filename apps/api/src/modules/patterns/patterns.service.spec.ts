import assert from 'node:assert/strict';
import {
  PATTERN_FINISHED_RETENTION_MINUTES,
  PATTERN_SCAN_TIMEFRAMES,
  type PatternKind,
  type PatternStatus,
} from './patterns.types';

assert.deepEqual(PATTERN_SCAN_TIMEFRAMES, ['5m', '15m', '1h']);
assert.equal(PATTERN_FINISHED_RETENTION_MINUTES, 15);

const kinds: PatternKind[] = ['cascade', 'trendline', 'triangle'];
const statuses: PatternStatus[] = ['forming', 'confirmed', 'finished'];

assert.equal(kinds.length, 3);
assert.equal(statuses.length, 3);
