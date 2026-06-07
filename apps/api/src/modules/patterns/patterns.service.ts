import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  PATTERNS_PAGE_SIZE,
  PATTERN_FINISHED_RETENTION_MS,
} from './patterns.constants';
import { mapCandidateToPersistenceRow, mapPatternRow } from './patterns.mapper';
import type { PatternCandidate } from './detectors/detector.types';
import type { PatternKind, PersistedPatternPayload } from './patterns.types';

const ACTIVE_SETUP_KINDS: PatternKind[] = [
  'breakout',
  'retest',
  'structure_break',
  'liquidity_sweep',
];

@Injectable()
export class PatternsService {
  constructor(private readonly db: DatabaseService) {}

  async upsertScannerSnapshot(candidates: PatternCandidate[], now = Date.now()): Promise<void> {
    if (candidates.length === 0) return;

    try {
      for (const [index, candidate] of candidates.entries()) {
        const row = mapCandidateToPersistenceRow(candidate, now + (candidates.length - index));
        await this.db.query(
          `INSERT INTO detected_patterns (
            id, symbol, exchange, market_type, type, kind, timeframe,
            confidence, quality, points, geometry, description, direction,
            status, detected_at, updated_at, finished_at, expires_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (id) DO UPDATE SET
            kind = EXCLUDED.kind,
            timeframe = EXCLUDED.timeframe,
            status = EXCLUDED.status,
            quality = EXCLUDED.quality,
            confidence = EXCLUDED.confidence,
            points = EXCLUDED.points,
            geometry = EXCLUDED.geometry,
            updated_at = EXCLUDED.updated_at,
            finished_at = EXCLUDED.finished_at,
            expires_at = EXCLUDED.expires_at`,
          [
            row.id,
            row.symbol,
            row.exchange,
            row.marketType,
            row.kind,
            row.kind,
            row.timeframe,
            row.quality / 100,
            row.quality,
            JSON.stringify(row.geometry.pivots),
            JSON.stringify(row.geometry),
            `${row.kind} setup`,
            null,
            row.status,
            row.detectedAt,
            row.updatedAt,
            row.finishedAt,
            row.expiresAt,
          ],
        );
      }
    } catch (error) {
      console.error('Failed to upsert scanner snapshot:', error);
    }
  }

  async reconcileScannerSnapshot(
    scannedSymbols: string[],
    activeCandidateIds: string[],
    now = Date.now(),
  ): Promise<void> {
    if (scannedSymbols.length === 0) return;

    const values: unknown[] = [scannedSymbols, ACTIVE_SETUP_KINDS];
    const conditions = [
      `symbol = ANY($1)`,
      `kind = ANY($2)`,
      `status != 'finished'`,
    ];

    if (activeCandidateIds.length > 0) {
      values.push(activeCandidateIds);
      conditions.push(`NOT (id = ANY($${values.length}))`);
    }

    const staleResult = await this.db.query<{ id: string }>(
      `SELECT id
       FROM detected_patterns
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC, id DESC`,
      values,
    );

    for (const [index, row] of staleResult.rows.entries()) {
      const finishedAt = now - (index + 1);
      await this.db.query(
        `UPDATE detected_patterns
         SET status = 'finished',
             finished_at = $2,
             expires_at = $3,
             updated_at = $2
         WHERE id = $1`,
        [
          row.id,
          finishedAt,
          finishedAt + PATTERN_FINISHED_RETENTION_MS,
        ],
      );
    }
  }

  async expireStaleFinishedPatterns(now = Date.now()): Promise<void> {
    await this.db.query(
      `DELETE FROM detected_patterns
       WHERE status = 'finished'
         AND expires_at IS NOT NULL
         AND expires_at <= $1`,
      [now],
    );
  }

  async listPatterns(params: {
    cursor?: number;
    search?: string;
    kinds?: string[];
    timeframes?: string[];
    statuses?: string[];
    limit?: number;
  }): Promise<{
    items: PersistedPatternPayload[];
    hasMore: boolean;
    nextCursor: number | null;
  }> {
    const values: unknown[] = [Date.now(), ACTIVE_SETUP_KINDS];
    const conditions = [
      `(status != 'finished' OR (expires_at IS NOT NULL AND expires_at > $1))`,
      `kind = ANY($2)`,
    ];

    if (params.search) {
      values.push(`%${params.search}%`);
      conditions.push(`symbol ILIKE $${values.length}`);
    }

    if (params.kinds?.length) {
      values.push(params.kinds);
      conditions.push(`kind = ANY($${values.length})`);
    }

    if (params.timeframes?.length) {
      values.push(params.timeframes);
      conditions.push(`timeframe = ANY($${values.length})`);
    }

    if (params.statuses?.length) {
      values.push(params.statuses);
      conditions.push(`status = ANY($${values.length})`);
    }

    if (params.cursor) {
      values.push(params.cursor);
      conditions.push(`updated_at < $${values.length}`);
    }

    const limit = params.limit ?? PATTERNS_PAGE_SIZE;
    values.push(limit + 1);

    const result = await this.db.query(
      `SELECT
        id,
        exchange,
        market_type,
        symbol,
        timeframe,
        kind,
        status,
        quality,
        geometry,
        detected_at,
        updated_at,
        finished_at,
        expires_at
      FROM detected_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC, quality DESC, id DESC
      LIMIT $${values.length}`,
      values,
    );

    const rows = result.rows.map(mapPatternRow);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.updatedAt ?? null : null,
    };
  }

  async getPattern(id: string): Promise<PersistedPatternPayload | null> {
    const result = await this.db.query(
      `SELECT
        id,
        exchange,
        market_type,
        symbol,
        timeframe,
        kind,
        status,
        quality,
        geometry,
        detected_at,
        updated_at,
        finished_at,
        expires_at
      FROM detected_patterns
      WHERE id = $1
        AND kind = ANY($2)
      LIMIT 1`,
      [id, ACTIVE_SETUP_KINDS],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapPatternRow(result.rows[0]);
  }
}
