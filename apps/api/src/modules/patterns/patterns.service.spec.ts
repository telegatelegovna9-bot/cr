import assert from 'node:assert/strict';
import {
  mapCandidateToPersistenceRow,
  shouldKeepPatternVisible,
} from './patterns.mapper';
import {
  PATTERN_FINISHED_RETENTION_MINUTES,
  PATTERN_SCAN_TIMEFRAMES,
  type PatternKind,
  type PatternStatus,
} from './patterns.types';

assert.deepEqual(PATTERN_SCAN_TIMEFRAMES, ['15m', '1h']);
assert.equal(PATTERN_FINISHED_RETENTION_MINUTES, 15);

const kinds: PatternKind[] = ['breakout', 'retest', 'structure_break', 'liquidity_sweep'];
const statuses: PatternStatus[] = ['forming', 'confirmed', 'finished'];

assert.equal(kinds.length, 4);
assert.equal(statuses.length, 3);

const mapped = mapCandidateToPersistenceRow(
  {
    id: 'p1',
    exchange: 'binance',
    marketType: 'futures',
    symbol: 'BTC/USDT:USDT',
    timeframe: '15m',
    kind: 'breakout',
    status: 'confirmed',
    quality: 81,
    from: 1,
    to: 2,
    geometry: {
      anchorTimeFrom: 1,
      anchorTimeTo: 2,
      priceMin: 10,
      priceMax: 20,
      pivots: [],
      lines: [],
      zones: [],
    },
  },
  1000,
);

assert.equal(mapped.symbol, 'BTC/USDT:USDT');
assert.equal(mapped.status, 'confirmed');
assert.equal(mapped.updatedAt, 1000);

assert.equal(
  shouldKeepPatternVisible(
    {
      status: 'finished',
      expiresAt: Date.now() + PATTERN_FINISHED_RETENTION_MINUTES * 60_000,
    },
    Date.now(),
  ),
  true,
);

assert.equal(
  shouldKeepPatternVisible(
    {
      status: 'finished',
      expiresAt: Date.now() - 1,
    },
    Date.now(),
  ),
  false,
);
