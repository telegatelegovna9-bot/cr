import type { QueryResultRow } from 'pg';
import type { PatternCandidate } from './detectors/detector.types';
import { PATTERN_FINISHED_RETENTION_MS } from './patterns.constants';
import { normalizePatternGeometry } from './geometry-normalizer';
import type { PersistedPatternPayload } from './patterns.types';

type PersistedPatternRow = QueryResultRow & {
  id: string;
  exchange: 'binance';
  market_type: 'futures';
  symbol: string;
  timeframe: PersistedPatternPayload['timeframe'];
  kind: PersistedPatternPayload['kind'];
  status: PersistedPatternPayload['status'];
  quality: number;
  geometry: PersistedPatternPayload['geometry'];
  detected_at: number;
  updated_at: number;
  finished_at: number | null;
  expires_at: number | null;
};

export function mapCandidateToPersistenceRow(
  candidate: PatternCandidate,
  now: number,
): PersistedPatternPayload {
  const finishedAt = candidate.status === 'finished' ? now : null;

  return {
    id: candidate.id,
    exchange: candidate.exchange,
    marketType: candidate.marketType,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    kind: candidate.kind,
    status: candidate.status,
    quality: candidate.quality,
    geometry: normalizePatternGeometry(candidate.kind, candidate.geometry),
    detectedAt: now,
    updatedAt: now,
    finishedAt,
    expiresAt: finishedAt === null ? null : finishedAt + PATTERN_FINISHED_RETENTION_MS,
  };
}

export function mapPatternRow(row: PersistedPatternRow): PersistedPatternPayload {
  return {
    id: row.id,
    exchange: row.exchange,
    marketType: row.market_type,
    symbol: row.symbol,
    timeframe: row.timeframe,
    kind: row.kind,
    status: row.status,
    quality: row.quality,
    geometry: normalizePatternGeometry(row.kind, row.geometry),
    detectedAt: Number(row.detected_at),
    updatedAt: Number(row.updated_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  };
}

export function shouldKeepPatternVisible(
  pattern: Pick<PersistedPatternPayload, 'status' | 'expiresAt'>,
  now: number,
): boolean {
  if (pattern.status !== 'finished') {
    return true;
  }

  return pattern.expiresAt !== null && pattern.expiresAt > now;
}
