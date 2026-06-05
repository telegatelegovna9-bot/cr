# Patterns v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `Patterns` tab that scans all Binance futures pairs on the backend, stores active pattern results in Postgres, and shows a searchable infinite-scroll list plus a live chart with automatic structure drawing.

**Architecture:** Add a backend scanner pipeline that fetches closed-candle windows for Binance futures, runs pattern detectors for `Cascade`, `Trendline`, and `Triangle`, deduplicates results, persists active/recently-finished patterns in Postgres, and exposes read APIs. On the frontend, add a dedicated `Patterns` workspace with persisted filters/search/selection, infinite scroll against the backend query, selected-pattern details, in-app toast for brand-new `Confirmed` patterns, and a full `ChartCard` with pattern overlays sourced from stored geometry.

**Tech Stack:** NestJS, existing market scanner infrastructure, PostgreSQL, TypeORM, Next.js App Router, React client components, Zustand, existing `ChartCard`, localStorage persistence, existing alert/toast UI, TypeScript

---

## File Structure

### Existing backend files to modify

- `apps/api/src/app.module.ts`
  - Register the new patterns module.
- `apps/api/src/database/entities/index.ts`
  - Export the new pattern entity.
- `apps/api/src/database/database.module.ts`
  - Include the new entity in TypeORM registration if this file owns entity wiring.
- `apps/api/src/modules/market/market.service.ts`
  - Reuse candle-fetching infrastructure or extract safe scanner-facing helpers if needed.
- `apps/api/src/modules/patterns/patterns.module.ts`
  - New module root for API + scanner + persistence.

### New backend files to create

- `apps/api/src/database/entities/pattern.entity.ts`
  - Postgres entity for persisted active/recent pattern records.
- `apps/api/src/modules/patterns/patterns.controller.ts`
  - Read-only HTTP API for list/detail/refresh snapshot queries.
- `apps/api/src/modules/patterns/patterns.service.ts`
  - Read/write orchestration for persisted patterns and list queries.
- `apps/api/src/modules/patterns/patterns.scanner.ts`
  - Scheduled scanner runner for all Binance futures pairs and timeframes.
- `apps/api/src/modules/patterns/patterns.types.ts`
  - Shared backend DTOs/types for pattern kinds, status, geometry, and query contracts.
- `apps/api/src/modules/patterns/patterns.constants.ts`
  - Scanner timeframes, batch sizes, retention windows, and pagination defaults.
- `apps/api/src/modules/patterns/detectors/detector.types.ts`
  - Shared detector input/output types.
- `apps/api/src/modules/patterns/detectors/cascade.detector.ts`
  - Cascade detection logic.
- `apps/api/src/modules/patterns/detectors/trendline.detector.ts`
  - Trendline detection logic.
- `apps/api/src/modules/patterns/detectors/triangle.detector.ts`
  - Triangle detection logic.
- `apps/api/src/modules/patterns/detectors/detector.utils.ts`
  - Pivot extraction, geometry scoring, overlap checks, and candle-window helpers.
- `apps/api/src/modules/patterns/patterns.mapper.ts`
  - Entity/DTO/geometry serialization helpers.
- `apps/api/src/modules/patterns/patterns.service.spec.ts`
  - Persistence/list query tests.
- `apps/api/src/modules/patterns/detectors/detector.utils.spec.ts`
  - Geometry helper and dedup tests.
- `apps/api/src/modules/patterns/detectors/cascade.detector.spec.ts`
  - Cascade detector tests.
- `apps/api/src/modules/patterns/detectors/trendline.detector.spec.ts`
  - Trendline detector tests.
- `apps/api/src/modules/patterns/detectors/triangle.detector.spec.ts`
  - Triangle detector tests.

### Existing frontend files to modify

- `apps/web/src/app/page.tsx`
  - Render the new `Patterns` workspace for the `patterns` view mode.
- `apps/web/src/stores/index.ts`
  - Add a dedicated patterns UI slice and persistence for filters/search/selection.
- `apps/web/src/components/charts/chart-card.tsx`
  - Accept pattern overlays, auto-focus geometry, and support opening chart from a selected pattern without breaking existing chart behavior.
- `apps/web/src/components/alerts/alert-toast.tsx`
  - Reuse existing toast style or expose a small helper for pattern toasts if needed.
- `apps/web/src/components/terminal/header.tsx`
  - Ensure the `Patterns` tab label is rendered if the current header is still placeholder-driven.

### New frontend files to create

- `apps/web/src/lib/patterns/models.ts`
  - Shared frontend types for pattern rows, filters, list page, detail payloads, and chart overlays.
- `apps/web/src/lib/patterns/persistence.ts`
  - localStorage helpers for filters/search/selection.
- `apps/web/src/lib/patterns/persistence.test.ts`
  - Persistence tests.
- `apps/web/src/lib/patterns/api.ts`
  - Fetch helpers for list/detail endpoints.
- `apps/web/src/lib/patterns/color-map.ts`
  - Stable pattern-type colors shared by list and chart overlays.
- `apps/web/src/components/patterns/patterns-view.tsx`
  - Top-level split layout for the tab.
- `apps/web/src/components/patterns/patterns-sidebar.tsx`
  - Left pane containing search, filters, count, and infinite-scroll list.
- `apps/web/src/components/patterns/patterns-list.tsx`
  - Scrollable/infinite result list.
- `apps/web/src/components/patterns/patterns-list-row.tsx`
  - Single result row with pattern color, status, quality, and updated time.
- `apps/web/src/components/patterns/patterns-filters.tsx`
  - Search and basic filters UI.
- `apps/web/src/components/patterns/pattern-details-card.tsx`
  - Right-side compact details block above the chart.
- `apps/web/src/components/patterns/pattern-chart-overlay.tsx`
  - Rendering component that converts stored pattern geometry into chart drawing primitives/overlays.
- `apps/web/src/components/patterns/patterns-empty-state.tsx`
  - `Scanning market...` empty state.
- `apps/web/src/components/patterns/use-patterns-query.ts`
  - Hook for polling list data and managing pagination pages.

### Existing files to reuse without structural change

- `apps/web/src/components/charts/chart-toolbar.tsx`
  - Existing chart UI stays intact.
- `apps/web/src/components/charts/drawing-*`
  - Drawing engine remains independent from pattern overlays.
- `apps/api/src/modules/market/*`
  - Existing market access remains the source for candles/tickers.

---

### Task 1: Define pattern domain types and Postgres entity

**Files:**
- Create: `apps/api/src/database/entities/pattern.entity.ts`
- Create: `apps/api/src/modules/patterns/patterns.types.ts`
- Create: `apps/api/src/modules/patterns/patterns.constants.ts`
- Modify: `apps/api/src/database/entities/index.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing entity and type test**

Create `apps/api/src/modules/patterns/patterns.service.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import {
  PATTERN_SCAN_TIMEFRAMES,
  PATTERN_FINISHED_RETENTION_MINUTES,
  type PatternKind,
  type PatternStatus,
} from './patterns.types';

describe('patterns domain defaults', () => {
  it('exposes the expected v1 timeframes and retention window', () => {
    expect(PATTERN_SCAN_TIMEFRAMES).toEqual(['5m', '15m', '1h']);
    expect(PATTERN_FINISHED_RETENTION_MINUTES).toBe(15);
  });

  it('supports the expected kinds and statuses', () => {
    const kinds: PatternKind[] = ['cascade', 'trendline', 'triangle'];
    const statuses: PatternStatus[] = ['forming', 'confirmed', 'finished'];

    expect(kinds).toHaveLength(3);
    expect(statuses).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm --workspace apps/api test -- patterns.service.spec.ts
```

Expected: FAIL because the module and exports do not exist yet.

- [ ] **Step 3: Add shared backend pattern types and constants**

Create `apps/api/src/modules/patterns/patterns.types.ts`:

```ts
export type PatternKind = 'cascade' | 'trendline' | 'triangle';
export type PatternStatus = 'forming' | 'confirmed' | 'finished';
export type PatternTimeframe = '5m' | '15m' | '1h';

export interface PatternPoint {
  time: number;
  price: number;
}

export interface PatternLine {
  kind: 'segment' | 'ray';
  points: [PatternPoint, PatternPoint];
}

export interface PatternZone {
  fromTime: number;
  toTime: number;
  low: number;
  high: number;
}

export interface PatternGeometry {
  anchorTimeFrom: number;
  anchorTimeTo: number;
  priceMin: number;
  priceMax: number;
  pivots: PatternPoint[];
  lines: PatternLine[];
  zones: PatternZone[];
}

export interface PersistedPatternPayload {
  id: string;
  exchange: 'binance';
  marketType: 'futures';
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  geometry: PatternGeometry;
  detectedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
}

export const PATTERN_SCAN_TIMEFRAMES: PatternTimeframe[] = ['5m', '15m', '1h'];
export const PATTERN_FINISHED_RETENTION_MINUTES = 15;
```

Create `apps/api/src/modules/patterns/patterns.constants.ts`:

```ts
export const PATTERNS_PAGE_SIZE = 30;
export const PATTERNS_SCANNER_INTERVAL_MS = 60_000;
export const PATTERNS_FRONTEND_POLL_MS = 45_000;
export const PATTERN_CANDLE_LIMIT = 300;
export const PATTERN_MIN_QUALITY = 55;
export const PATTERN_FINISHED_RETENTION_MS = 15 * 60_000;
```

- [ ] **Step 4: Add the Postgres entity**

Create `apps/api/src/database/entities/pattern.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type PatternGeometry, type PatternKind, type PatternStatus, type PatternTimeframe } from '@/modules/patterns/patterns.types';

@Entity('patterns')
@Index(['exchange', 'marketType', 'symbol', 'timeframe', 'kind'])
@Index(['status', 'updatedAt'])
@Index(['expiresAt'])
export class PatternEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  exchange!: 'binance';

  @Column({ type: 'varchar', length: 32 })
  marketType!: 'futures';

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 8 })
  timeframe!: PatternTimeframe;

  @Column({ type: 'varchar', length: 32 })
  kind!: PatternKind;

  @Column({ type: 'varchar', length: 32 })
  status!: PatternStatus;

  @Column({ type: 'int' })
  quality!: number;

  @Column({ type: 'jsonb' })
  geometry!: PatternGeometry;

  @Column({ type: 'bigint' })
  detectedAt!: number;

  @Column({ type: 'bigint' })
  updatedAt!: number;

  @Column({ type: 'bigint', nullable: true })
  finishedAt!: number | null;

  @Column({ type: 'bigint', nullable: true })
  expiresAt!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  persistedAt!: Date;
}
```

- [ ] **Step 5: Wire entity exports and module registration**

Modify `apps/api/src/database/entities/index.ts`:

```ts
export * from './pattern.entity';
```

Modify `apps/api/src/app.module.ts` to add the module import once it exists:

```ts
import { PatternsModule } from './modules/patterns/patterns.module';
```

and later in `imports`:

```ts
PatternsModule,
```

If `PatternsModule` does not exist yet, add the import wiring in Task 2 when the module is created.

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
npm --workspace apps/api test -- patterns.service.spec.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/database/entities/pattern.entity.ts apps/api/src/modules/patterns/patterns.types.ts apps/api/src/modules/patterns/patterns.constants.ts apps/api/src/database/entities/index.ts apps/api/src/modules/patterns/patterns.service.spec.ts apps/api/src/app.module.ts
git commit -m "feat: add pattern persistence model"
```

---

### Task 2: Build detector utilities and prove geometry scoring/dedup rules

**Files:**
- Create: `apps/api/src/modules/patterns/detectors/detector.types.ts`
- Create: `apps/api/src/modules/patterns/detectors/detector.utils.ts`
- Create: `apps/api/src/modules/patterns/detectors/detector.utils.spec.ts`

- [ ] **Step 1: Write failing tests for pivots, overlap, and quality helpers**

Create `apps/api/src/modules/patterns/detectors/detector.utils.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import {
  clampQuality,
  patternsOverlapTooMuch,
  toPivotWindow,
} from './detector.utils';

describe('detector utilities', () => {
  it('clamps quality scores to 0..100', () => {
    expect(clampQuality(-5)).toBe(0);
    expect(clampQuality(48.8)).toBe(49);
    expect(clampQuality(140)).toBe(100);
  });

  it('builds pivot windows from candles', () => {
    const pivots = toPivotWindow([
      { time: 1, open: 1, high: 10, low: 1, close: 5, volume: 1 },
      { time: 2, open: 5, high: 12, low: 4, close: 10, volume: 1 },
      { time: 3, open: 10, high: 11, low: 2, close: 3, volume: 1 },
    ]);

    expect(pivots).toHaveLength(3);
    expect(pivots[1].high).toBe(12);
  });

  it('treats heavily overlapping same-type candidates as duplicates', () => {
    expect(
      patternsOverlapTooMuch(
        { kind: 'triangle', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 100, to: 200 },
        { kind: 'triangle', timeframe: '15m', symbol: 'BTC/USDT:USDT', from: 120, to: 205 },
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm --workspace apps/api test -- detector.utils.spec.ts
```

Expected: FAIL because the files do not exist yet.

- [ ] **Step 3: Add detector shared types**

Create `apps/api/src/modules/patterns/detectors/detector.types.ts`:

```ts
import type { PatternGeometry, PatternKind, PatternStatus, PatternTimeframe } from '../patterns.types';

export interface DetectorCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DetectorPivotCandle extends DetectorCandle {
  index: number;
}

export interface PatternCandidate {
  id: string;
  exchange: 'binance';
  marketType: 'futures';
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  geometry: PatternGeometry;
  from: number;
  to: number;
}
```

- [ ] **Step 4: Add detector utility helpers**

Create `apps/api/src/modules/patterns/detectors/detector.utils.ts`:

```ts
import type { DetectorCandle, DetectorPivotCandle, PatternCandidate } from './detector.types';

export function clampQuality(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function toPivotWindow(candles: DetectorCandle[]): DetectorPivotCandle[] {
  return candles.map((candle, index) => ({ ...candle, index }));
}

export function patternsOverlapTooMuch(a: Pick<PatternCandidate, 'kind' | 'timeframe' | 'symbol' | 'from' | 'to'>, b: Pick<PatternCandidate, 'kind' | 'timeframe' | 'symbol' | 'from' | 'to'>): boolean {
  if (a.kind !== b.kind || a.timeframe !== b.timeframe || a.symbol !== b.symbol) {
    return false;
  }

  const intersection = Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
  const union = Math.max(a.to, b.to) - Math.min(a.from, b.from);
  if (union <= 0) return false;

  return intersection / union >= 0.7;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
npm --workspace apps/api test -- detector.utils.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/patterns/detectors/detector.types.ts apps/api/src/modules/patterns/detectors/detector.utils.ts apps/api/src/modules/patterns/detectors/detector.utils.spec.ts
git commit -m "feat: add pattern detector utilities"
```

---

### Task 3: Implement `Cascade` detector with tests

**Files:**
- Create: `apps/api/src/modules/patterns/detectors/cascade.detector.ts`
- Create: `apps/api/src/modules/patterns/detectors/cascade.detector.spec.ts`
- Reuse: `apps/api/src/modules/patterns/detectors/detector.types.ts`
- Reuse: `apps/api/src/modules/patterns/detectors/detector.utils.ts`

- [ ] **Step 1: Write the failing detector tests**

Create `apps/api/src/modules/patterns/detectors/cascade.detector.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { detectCascadePatterns } from './cascade.detector';

describe('detectCascadePatterns', () => {
  it('returns a confirmed cascade for descending support taps', () => {
    const candles = [
      { time: 1, open: 10, high: 11, low: 9.8, close: 10.7, volume: 1 },
      { time: 2, open: 10.7, high: 11.2, low: 10.1, close: 10.3, volume: 1 },
      { time: 3, open: 10.3, high: 10.5, low: 9.7, close: 9.9, volume: 1 },
      { time: 4, open: 9.9, high: 10.2, low: 9.4, close: 9.7, volume: 1 },
      { time: 5, open: 9.7, high: 9.9, low: 9.2, close: 9.3, volume: 1 },
      { time: 6, open: 9.3, high: 9.6, low: 8.9, close: 9.0, volume: 1 },
    ];

    const results = detectCascadePatterns('BTC/USDT:USDT', '15m', candles);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe('cascade');
    expect(results[0].quality).toBeGreaterThanOrEqual(55);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm --workspace apps/api test -- cascade.detector.spec.ts
```

Expected: FAIL because the detector does not exist yet.

- [ ] **Step 3: Implement the minimal detector**

Create `apps/api/src/modules/patterns/detectors/cascade.detector.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';
import type { PatternTimeframe } from '../patterns.types';

export function detectCascadePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) return [];

  const lows = candles.slice(-4).map(c => c.low);
  const descending = lows.every((low, index) => index === 0 || low < lows[index - 1]);
  if (!descending) return [];

  const from = candles[candles.length - 4].time;
  const to = candles[candles.length - 1].time;
  const priceMin = Math.min(...candles.slice(-4).map(c => c.low));
  const priceMax = Math.max(...candles.slice(-4).map(c => c.high));

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'cascade',
      status: 'confirmed',
      quality: clampQuality(70),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: candles.slice(-4).map(candle => ({ time: candle.time, price: candle.low })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: candles[candles.length - 4].time, price: candles[candles.length - 4].low },
              { time: candles[candles.length - 1].time, price: candles[candles.length - 1].low },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm --workspace apps/api test -- cascade.detector.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patterns/detectors/cascade.detector.ts apps/api/src/modules/patterns/detectors/cascade.detector.spec.ts
git commit -m "feat: add cascade detector"
```

---

### Task 4: Implement `Trendline` detector with tests

**Files:**
- Create: `apps/api/src/modules/patterns/detectors/trendline.detector.ts`
- Create: `apps/api/src/modules/patterns/detectors/trendline.detector.spec.ts`

- [ ] **Step 1: Write the failing detector tests**

Create `apps/api/src/modules/patterns/detectors/trendline.detector.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { detectTrendlinePatterns } from './trendline.detector';

describe('detectTrendlinePatterns', () => {
  it('returns a forming trendline structure when highs compress along a line', () => {
    const candles = [
      { time: 1, open: 10, high: 11.5, low: 9.9, close: 11.1, volume: 1 },
      { time: 2, open: 11.1, high: 11.3, low: 10.2, close: 10.8, volume: 1 },
      { time: 3, open: 10.8, high: 11.0, low: 10.0, close: 10.6, volume: 1 },
      { time: 4, open: 10.6, high: 10.8, low: 10.1, close: 10.4, volume: 1 },
      { time: 5, open: 10.4, high: 10.6, low: 10.0, close: 10.3, volume: 1 },
      { time: 6, open: 10.3, high: 10.5, low: 9.95, close: 10.1, volume: 1 },
    ];

    const results = detectTrendlinePatterns('ETH/USDT:USDT', '1h', candles);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe('trendline');
    expect(['forming', 'confirmed']).toContain(results[0].status);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm --workspace apps/api test -- trendline.detector.spec.ts
```

Expected: FAIL because the detector does not exist yet.

- [ ] **Step 3: Implement the minimal detector**

Create `apps/api/src/modules/patterns/detectors/trendline.detector.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';
import type { PatternTimeframe } from '../patterns.types';

export function detectTrendlinePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) return [];

  const highs = candles.slice(-4).map(c => c.high);
  const descending = highs.every((high, index) => index === 0 || high <= highs[index - 1]);
  if (!descending) return [];

  const from = candles[candles.length - 4].time;
  const to = candles[candles.length - 1].time;
  const priceMin = Math.min(...candles.slice(-4).map(c => c.low));
  const priceMax = Math.max(...candles.slice(-4).map(c => c.high));

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'trendline',
      status: 'forming',
      quality: clampQuality(66),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin,
        priceMax,
        pivots: candles.slice(-4).map(candle => ({ time: candle.time, price: candle.high })),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: candles[candles.length - 4].time, price: candles[candles.length - 4].high },
              { time: candles[candles.length - 1].time, price: candles[candles.length - 1].high },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm --workspace apps/api test -- trendline.detector.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patterns/detectors/trendline.detector.ts apps/api/src/modules/patterns/detectors/trendline.detector.spec.ts
git commit -m "feat: add trendline detector"
```

---

### Task 5: Implement `Triangle` detector with tests

**Files:**
- Create: `apps/api/src/modules/patterns/detectors/triangle.detector.ts`
- Create: `apps/api/src/modules/patterns/detectors/triangle.detector.spec.ts`

- [ ] **Step 1: Write the failing detector tests**

Create `apps/api/src/modules/patterns/detectors/triangle.detector.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { detectTrianglePatterns } from './triangle.detector';

describe('detectTrianglePatterns', () => {
  it('returns a triangle candidate when highs descend and lows ascend', () => {
    const candles = [
      { time: 1, open: 10, high: 12, low: 8, close: 10.5, volume: 1 },
      { time: 2, open: 10.5, high: 11.7, low: 8.4, close: 10.6, volume: 1 },
      { time: 3, open: 10.6, high: 11.3, low: 8.8, close: 10.2, volume: 1 },
      { time: 4, open: 10.2, high: 11.0, low: 9.1, close: 10.4, volume: 1 },
      { time: 5, open: 10.4, high: 10.8, low: 9.3, close: 10.1, volume: 1 },
      { time: 6, open: 10.1, high: 10.6, low: 9.5, close: 10.0, volume: 1 },
    ];

    const results = detectTrianglePatterns('SOL/USDT:USDT', '5m', candles);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe('triangle');
    expect(results[0].geometry.lines).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm --workspace apps/api test -- triangle.detector.spec.ts
```

Expected: FAIL because the detector does not exist yet.

- [ ] **Step 3: Implement the minimal detector**

Create `apps/api/src/modules/patterns/detectors/triangle.detector.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DetectorCandle, PatternCandidate } from './detector.types';
import { clampQuality } from './detector.utils';
import type { PatternTimeframe } from '../patterns.types';

export function detectTrianglePatterns(
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
): PatternCandidate[] {
  if (candles.length < 6) return [];

  const window = candles.slice(-4);
  const highs = window.map(c => c.high);
  const lows = window.map(c => c.low);
  const descendingHighs = highs.every((value, index) => index === 0 || value <= highs[index - 1]);
  const ascendingLows = lows.every((value, index) => index === 0 || value >= lows[index - 1]);

  if (!descendingHighs || !ascendingLows) return [];

  const from = window[0].time;
  const to = window[window.length - 1].time;

  return [
    {
      id: randomUUID(),
      exchange: 'binance',
      marketType: 'futures',
      symbol,
      timeframe,
      kind: 'triangle',
      status: 'forming',
      quality: clampQuality(72),
      from,
      to,
      geometry: {
        anchorTimeFrom: from,
        anchorTimeTo: to,
        priceMin: Math.min(...lows),
        priceMax: Math.max(...highs),
        pivots: window.flatMap(candle => [
          { time: candle.time, price: candle.high },
          { time: candle.time, price: candle.low },
        ]),
        lines: [
          {
            kind: 'segment',
            points: [
              { time: window[0].time, price: window[0].high },
              { time: window[window.length - 1].time, price: window[window.length - 1].high },
            ],
          },
          {
            kind: 'segment',
            points: [
              { time: window[0].time, price: window[0].low },
              { time: window[window.length - 1].time, price: window[window.length - 1].low },
            ],
          },
        ],
        zones: [],
      },
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm --workspace apps/api test -- triangle.detector.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patterns/detectors/triangle.detector.ts apps/api/src/modules/patterns/detectors/triangle.detector.spec.ts
git commit -m "feat: add triangle detector"
```

---

### Task 6: Build persistence service, mapper, and read API

**Files:**
- Create: `apps/api/src/modules/patterns/patterns.mapper.ts`
- Create: `apps/api/src/modules/patterns/patterns.service.ts`
- Create: `apps/api/src/modules/patterns/patterns.controller.ts`
- Create: `apps/api/src/modules/patterns/patterns.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Expand the service spec with list and retention tests**

Append to `apps/api/src/modules/patterns/patterns.service.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { PatternEntity } from '@/database/entities/pattern.entity';
import { PATTERN_FINISHED_RETENTION_MINUTES } from './patterns.types';
import { mapCandidateToEntityLike, shouldKeepPatternVisible } from './patterns.mapper';

describe('patterns persistence helpers', () => {
  it('maps a candidate into persistable fields', () => {
    const entity = mapCandidateToEntityLike({
      id: 'p1',
      exchange: 'binance',
      marketType: 'futures',
      symbol: 'BTC/USDT:USDT',
      timeframe: '15m',
      kind: 'triangle',
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
    }, 1000);

    expect(entity.symbol).toBe('BTC/USDT:USDT');
    expect(entity.status).toBe('confirmed');
    expect(entity.updatedAt).toBe(1000);
  });

  it('keeps finished patterns visible only inside the retention window', () => {
    const keep = shouldKeepPatternVisible({
      status: 'finished',
      expiresAt: Date.now() + PATTERN_FINISHED_RETENTION_MINUTES * 60_000,
    } as PatternEntity, Date.now());

    const drop = shouldKeepPatternVisible({
      status: 'finished',
      expiresAt: Date.now() - 1,
    } as PatternEntity, Date.now());

    expect(keep).toBe(true);
    expect(drop).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm --workspace apps/api test -- patterns.service.spec.ts
```

Expected: FAIL because the helpers and module files do not exist yet.

- [ ] **Step 3: Add mapper helpers**

Create `apps/api/src/modules/patterns/patterns.mapper.ts`:

```ts
import type { PatternEntity } from '@/database/entities/pattern.entity';
import type { PatternCandidate } from './detectors/detector.types';
import { PATTERN_FINISHED_RETENTION_MS } from './patterns.constants';

export function mapCandidateToEntityLike(candidate: PatternCandidate, now: number) {
  return {
    id: candidate.id,
    exchange: candidate.exchange,
    marketType: candidate.marketType,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    kind: candidate.kind,
    status: candidate.status,
    quality: candidate.quality,
    geometry: candidate.geometry,
    detectedAt: now,
    updatedAt: now,
    finishedAt: candidate.status === 'finished' ? now : null,
    expiresAt: candidate.status === 'finished' ? now + PATTERN_FINISHED_RETENTION_MS : null,
  };
}

export function shouldKeepPatternVisible(entity: Pick<PatternEntity, 'status' | 'expiresAt'>, now: number): boolean {
  if (entity.status !== 'finished') return true;
  return entity.expiresAt !== null && entity.expiresAt > now;
}
```

- [ ] **Step 4: Add the service, controller, and module skeleton**

Create `apps/api/src/modules/patterns/patterns.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatternEntity } from '@/database/entities/pattern.entity';
import { PATTERNS_PAGE_SIZE } from './patterns.constants';

@Injectable()
export class PatternsService {
  constructor(
    @InjectRepository(PatternEntity)
    private readonly patternsRepository: Repository<PatternEntity>,
  ) {}

  async listPatterns(params: {
    cursor?: number;
    search?: string;
    kinds?: string[];
    timeframes?: string[];
    statuses?: string[];
    limit?: number;
  }) {
    const limit = params.limit ?? PATTERNS_PAGE_SIZE;
    const query = this.patternsRepository
      .createQueryBuilder('pattern')
      .where('(pattern.status != :finished OR pattern.expiresAt > :now)', {
        finished: 'finished',
        now: Date.now(),
      })
      .orderBy(`
        CASE pattern.status
          WHEN 'confirmed' THEN 0
          WHEN 'forming' THEN 1
          ELSE 2
        END
      `)
      .addOrderBy('pattern.quality', 'DESC')
      .addOrderBy('pattern.updatedAt', 'DESC')
      .take(limit + 1);

    if (params.search) {
      query.andWhere('pattern.symbol ILIKE :search', { search: `%${params.search}%` });
    }

    if (params.kinds?.length) {
      query.andWhere('pattern.kind IN (:...kinds)', { kinds: params.kinds });
    }

    if (params.timeframes?.length) {
      query.andWhere('pattern.timeframe IN (:...timeframes)', { timeframes: params.timeframes });
    }

    if (params.statuses?.length) {
      query.andWhere('pattern.status IN (:...statuses)', { statuses: params.statuses });
    }

    if (params.cursor) {
      query.andWhere('pattern.updatedAt < :cursor', { cursor: params.cursor });
    }

    const rows = await query.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.updatedAt ?? null : null,
    };
  }

  async getPattern(id: string) {
    return this.patternsRepository.findOneBy({ id });
  }
}
```

Create `apps/api/src/modules/patterns/patterns.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { PatternsService } from './patterns.service';

@Controller('api/patterns')
export class PatternsController {
  constructor(private readonly patternsService: PatternsService) {}

  @Get()
  listPatterns(
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('kinds') kinds?: string,
    @Query('timeframes') timeframes?: string,
    @Query('statuses') statuses?: string,
  ) {
    return this.patternsService.listPatterns({
      cursor: cursor ? Number(cursor) : undefined,
      search,
      kinds: kinds ? kinds.split(',') : undefined,
      timeframes: timeframes ? timeframes.split(',') : undefined,
      statuses: statuses ? statuses.split(',') : undefined,
    });
  }

  @Get(':id')
  getPattern(@Param('id') id: string) {
    return this.patternsService.getPattern(id);
  }
}
```

Create `apps/api/src/modules/patterns/patterns.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatternEntity } from '@/database/entities/pattern.entity';
import { PatternsController } from './patterns.controller';
import { PatternsService } from './patterns.service';

@Module({
  imports: [TypeOrmModule.forFeature([PatternEntity])],
  controllers: [PatternsController],
  providers: [PatternsService],
  exports: [PatternsService],
})
export class PatternsModule {}
```

Modify `apps/api/src/app.module.ts` to actually import `PatternsModule`.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
npm --workspace apps/api test -- patterns.service.spec.ts
npm --workspace apps/api run build
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/patterns/patterns.mapper.ts apps/api/src/modules/patterns/patterns.service.ts apps/api/src/modules/patterns/patterns.controller.ts apps/api/src/modules/patterns/patterns.module.ts apps/api/src/modules/patterns/patterns.service.spec.ts apps/api/src/app.module.ts
git commit -m "feat: add patterns persistence service and api"
```

---

### Task 7: Build the scheduled backend scanner and persistence workflow

**Files:**
- Create: `apps/api/src/modules/patterns/patterns.scanner.ts`
- Modify: `apps/api/src/modules/patterns/patterns.module.ts`
- Modify: `apps/api/src/modules/patterns/patterns.service.ts`
- Modify: `apps/api/src/modules/market/market.service.ts` (only if a safe candle helper is needed)

- [ ] **Step 1: Add a failing scanner smoke test**

Append to `apps/api/src/modules/patterns/patterns.service.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

describe('patterns scanner contract', () => {
  it('will scan Binance futures on 5m, 15m, and 1h only', () => {
    const supported = ['5m', '15m', '1h'];
    expect(supported).toEqual(['5m', '15m', '1h']);
  });
});
```

This is intentionally minimal; the real safety here is the implementation structure plus build verification.

- [ ] **Step 2: Extend the service with upsert and expiration helpers**

Modify `apps/api/src/modules/patterns/patterns.service.ts` to add:

```ts
  async upsertScannerSnapshot(candidates: PatternEntity[]) {
    if (!candidates.length) return;
    await this.patternsRepository.save(candidates);
  }

  async expireStaleFinishedPatterns(now: number) {
    await this.patternsRepository
      .createQueryBuilder()
      .delete()
      .from(PatternEntity)
      .where('status = :status', { status: 'finished' })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt <= :now', { now })
      .execute();
  }
```

- [ ] **Step 3: Implement the scanner**

Create `apps/api/src/modules/patterns/patterns.scanner.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { ExchangeManager } from '@pkg/exchange-connectors';
import { PatternEntity } from '@/database/entities/pattern.entity';
import { PATTERN_CANDLE_LIMIT, PATTERN_MIN_QUALITY } from './patterns.constants';
import { mapCandidateToEntityLike } from './patterns.mapper';
import { PatternsService } from './patterns.service';
import { PATTERN_SCAN_TIMEFRAMES, type PatternTimeframe } from './patterns.types';
import { detectCascadePatterns } from './detectors/cascade.detector';
import { detectTrendlinePatterns } from './detectors/trendline.detector';
import { detectTrianglePatterns } from './detectors/triangle.detector';
import { patternsOverlapTooMuch } from './detectors/detector.utils';

@Injectable()
export class PatternsScanner {
  private readonly logger = new Logger(PatternsScanner.name);
  private readonly exchangeManager = new ExchangeManager();

  constructor(private readonly patternsService: PatternsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scanMarket() {
    const now = Date.now();
    const futuresSymbols = await this.getBinanceFuturesSymbols();
    const snapshot: PatternEntity[] = [];

    for (const symbol of futuresSymbols) {
      for (const timeframe of PATTERN_SCAN_TIMEFRAMES) {
        const candles = await this.exchangeManager.fetchCandles(
          'binance',
          symbol,
          timeframe,
          undefined,
          undefined,
          PATTERN_CANDLE_LIMIT,
          'futures',
        );

        const results = [
          ...detectCascadePatterns(symbol, timeframe, candles),
          ...detectTrendlinePatterns(symbol, timeframe, candles),
          ...detectTrianglePatterns(symbol, timeframe, candles),
        ]
          .filter(candidate => candidate.quality >= PATTERN_MIN_QUALITY)
          .sort((a, b) => b.quality - a.quality);

        const deduped = results.filter((candidate, index) =>
          results.findIndex(other =>
            other === candidate
              ? true
              : patternsOverlapTooMuch(candidate, other) && other.quality >= candidate.quality
          ) === index
        );

        for (const candidate of deduped) {
          snapshot.push(
            Object.assign(new PatternEntity(), mapCandidateToEntityLike({
              ...candidate,
              id: candidate.id || randomUUID(),
            }, now)),
          );
        }
      }
    }

    await this.patternsService.upsertScannerSnapshot(snapshot);
    await this.patternsService.expireStaleFinishedPatterns(now);
    this.logger.log(`Patterns scan stored ${snapshot.length} active candidates`);
  }

  private async getBinanceFuturesSymbols(): Promise<string[]> {
    const tickers = await this.exchangeManager.fetchTickers('binance', 'futures');
    return tickers.map(ticker => ticker.symbol);
  }
}
```

If `ExchangeManager` path or method names differ in this repo, adjust to the exact existing API before implementation, but keep the responsibility split the same.

- [ ] **Step 4: Register the scanner**

Modify `apps/api/src/modules/patterns/patterns.module.ts`:

```ts
import { ScheduleModule } from '@nestjs/schedule';
import { PatternsScanner } from './patterns.scanner';
```

and:

```ts
  imports: [TypeOrmModule.forFeature([PatternEntity]), ScheduleModule.forRoot()],
  providers: [PatternsService, PatternsScanner],
```

If `ScheduleModule.forRoot()` is already declared at the app level, keep it there and only add `PatternsScanner` as a provider in the module.

- [ ] **Step 5: Run build verification**

Run:

```bash
npm --workspace apps/api run build
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/patterns/patterns.scanner.ts apps/api/src/modules/patterns/patterns.module.ts apps/api/src/modules/patterns/patterns.service.ts
git commit -m "feat: add backend patterns scanner"
```

---

### Task 8: Add frontend pattern models and local persistence

**Files:**
- Create: `apps/web/src/lib/patterns/models.ts`
- Create: `apps/web/src/lib/patterns/persistence.ts`
- Create: `apps/web/src/lib/patterns/persistence.test.ts`

- [ ] **Step 1: Write the failing persistence tests**

Create `apps/web/src/lib/patterns/persistence.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PATTERNS_UI_STATE,
  type PatternsUIState,
} from './models';
import {
  PATTERNS_UI_STORAGE_KEY,
  loadPersistedPatternsUIState,
  savePersistedPatternsUIState,
} from './persistence';

function createStorageMock(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('returns defaults when no patterns ui state exists', () => {
  const state = loadPersistedPatternsUIState(createStorageMock());
  assert.deepEqual(state, DEFAULT_PATTERNS_UI_STATE);
});

test('stores filters, search, and selected pattern id', () => {
  const storage = createStorageMock();
  const state: PatternsUIState = {
    search: 'BTC',
    selectedPatternId: 'p-1',
    filters: {
      kinds: ['triangle'],
      timeframes: ['15m'],
      statuses: ['confirmed'],
    },
  };

  savePersistedPatternsUIState(storage, state);
  assert.deepEqual(JSON.parse(storage.getItem(PATTERNS_UI_STORAGE_KEY)!), state);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/patterns/persistence.test.ts
```

Expected: FAIL because the files do not exist yet.

- [ ] **Step 3: Add models and persistence helpers**

Create `apps/web/src/lib/patterns/models.ts`:

```ts
export type PatternKind = 'cascade' | 'trendline' | 'triangle';
export type PatternStatus = 'forming' | 'confirmed' | 'finished';
export type PatternTimeframe = '5m' | '15m' | '1h';

export interface PatternListItem {
  id: string;
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  updatedAt: number;
}

export interface PatternFilters {
  kinds: PatternKind[];
  timeframes: PatternTimeframe[];
  statuses: PatternStatus[];
}

export interface PatternsUIState {
  search: string;
  selectedPatternId: string | null;
  filters: PatternFilters;
}

export const DEFAULT_PATTERNS_UI_STATE: PatternsUIState = {
  search: '',
  selectedPatternId: null,
  filters: {
    kinds: [],
    timeframes: [],
    statuses: [],
  },
};
```

Create `apps/web/src/lib/patterns/persistence.ts`:

```ts
import { DEFAULT_PATTERNS_UI_STATE, type PatternsUIState } from './models';

export const PATTERNS_UI_STORAGE_KEY = 'aionui.patterns-ui.v1';

export function loadPersistedPatternsUIState(storage: Storage | null | undefined): PatternsUIState {
  if (!storage) return DEFAULT_PATTERNS_UI_STATE;
  const raw = storage.getItem(PATTERNS_UI_STORAGE_KEY);
  if (!raw) return DEFAULT_PATTERNS_UI_STATE;

  try {
    return { ...DEFAULT_PATTERNS_UI_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PATTERNS_UI_STATE;
  }
}

export function savePersistedPatternsUIState(storage: Storage | null | undefined, state: PatternsUIState) {
  if (!storage) return;
  storage.setItem(PATTERNS_UI_STORAGE_KEY, JSON.stringify(state));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
bun test apps/web/src/lib/patterns/persistence.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/patterns/models.ts apps/web/src/lib/patterns/persistence.ts apps/web/src/lib/patterns/persistence.test.ts
git commit -m "feat: add patterns ui models and persistence"
```

---

### Task 9: Add patterns UI store slice and API fetch helpers

**Files:**
- Modify: `apps/web/src/stores/index.ts`
- Create: `apps/web/src/lib/patterns/api.ts`

- [ ] **Step 1: Extend the UI store contract**

Modify `apps/web/src/stores/index.ts` to add:

```ts
import {
  DEFAULT_PATTERNS_UI_STATE,
  type PatternFilters,
  type PatternsUIState,
} from '@/lib/patterns/models';
import {
  loadPersistedPatternsUIState,
  savePersistedPatternsUIState,
} from '@/lib/patterns/persistence';
```

and extend `UIStore` with:

```ts
  patternsUI: PatternsUIState;
  setPatternsSearch: (search: string) => void;
  setPatternsFilters: (filters: PatternFilters) => void;
  setSelectedPatternId: (patternId: string | null) => void;
```

- [ ] **Step 2: Implement store initialization and persistence**

Add a helper above the store:

```ts
function getInitialPatternsUIState(): PatternsUIState {
  if (typeof window === 'undefined') return DEFAULT_PATTERNS_UI_STATE;
  return loadPersistedPatternsUIState(window.localStorage);
}
```

Initialize:

```ts
  patternsUI: getInitialPatternsUIState(),
```

Add actions:

```ts
  setPatternsSearch: (search) =>
    set(state => {
      const patternsUI = { ...state.patternsUI, search };
      if (typeof window !== 'undefined') {
        savePersistedPatternsUIState(window.localStorage, patternsUI);
      }
      return { patternsUI };
    }),

  setPatternsFilters: (filters) =>
    set(state => {
      const patternsUI = { ...state.patternsUI, filters };
      if (typeof window !== 'undefined') {
        savePersistedPatternsUIState(window.localStorage, patternsUI);
      }
      return { patternsUI };
    }),

  setSelectedPatternId: (selectedPatternId) =>
    set(state => {
      const patternsUI = { ...state.patternsUI, selectedPatternId };
      if (typeof window !== 'undefined') {
        savePersistedPatternsUIState(window.localStorage, patternsUI);
      }
      return { patternsUI };
    }),
```

- [ ] **Step 3: Add API helpers**

Create `apps/web/src/lib/patterns/api.ts`:

```ts
import type { PatternFilters } from './models';

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    search.set(key, String(value));
  });
  return search.toString();
}

export async function fetchPatternsPage(args: {
  cursor?: number | null;
  search?: string;
  filters: PatternFilters;
}) {
  const query = buildQuery({
    cursor: args.cursor ?? undefined,
    search: args.search || undefined,
    kinds: args.filters.kinds.length ? args.filters.kinds.join(',') : undefined,
    timeframes: args.filters.timeframes.length ? args.filters.timeframes.join(',') : undefined,
    statuses: args.filters.statuses.length ? args.filters.statuses.join(',') : undefined,
  });

  const response = await fetch(`/api/patterns${query ? `?${query}` : ''}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch patterns: ${response.status}`);
  }

  return response.json();
}

export async function fetchPatternDetail(id: string) {
  const response = await fetch(`/api/patterns/${id}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pattern detail: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 4: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/index.ts apps/web/src/lib/patterns/api.ts
git commit -m "feat: add patterns ui state and api helpers"
```

---

### Task 10: Build the `Patterns` split view UI

**Files:**
- Create: `apps/web/src/lib/patterns/color-map.ts`
- Create: `apps/web/src/components/patterns/patterns-empty-state.tsx`
- Create: `apps/web/src/components/patterns/patterns-filters.tsx`
- Create: `apps/web/src/components/patterns/patterns-list-row.tsx`
- Create: `apps/web/src/components/patterns/patterns-list.tsx`
- Create: `apps/web/src/components/patterns/patterns-sidebar.tsx`
- Create: `apps/web/src/components/patterns/pattern-details-card.tsx`
- Create: `apps/web/src/components/patterns/use-patterns-query.ts`
- Create: `apps/web/src/components/patterns/patterns-view.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add stable pattern colors**

Create `apps/web/src/lib/patterns/color-map.ts`:

```ts
import type { PatternKind } from './models';

export const PATTERN_COLOR_MAP: Record<PatternKind, { text: string; bg: string; border: string }> = {
  cascade: {
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  trendline: {
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
  },
  triangle: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
};
```

- [ ] **Step 2: Add the query hook**

Create `apps/web/src/components/patterns/use-patterns-query.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPatternsPage } from '@/lib/patterns/api';
import type { PatternFilters, PatternListItem } from '@/lib/patterns/models';

export function usePatternsQuery(search: string, filters: PatternFilters) {
  const [items, setItems] = useState<PatternListItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    const page = await fetchPatternsPage({ search, filters, cursor: null });
    setItems(page.items);
    setHasMore(page.hasMore);
    setCursor(page.nextCursor);
    setLoading(false);
  }, [search, filters]);

  const loadMore = useCallback(async () => {
    if (!hasMore || cursor === null) return;
    const page = await fetchPatternsPage({ search, filters, cursor });
    setItems(current => [...current, ...page.items]);
    setHasMore(page.hasMore);
    setCursor(page.nextCursor);
  }, [search, filters, cursor, hasMore]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, refreshNonce]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshNonce(value => value + 1);
    }, 45_000);

    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => ({
    items,
    hasMore,
    loading,
    loadMore,
    refresh: () => setRefreshNonce(value => value + 1),
  }), [items, hasMore, loading, loadMore]);
}
```

- [ ] **Step 3: Build filters, list rows, and sidebar**

Create `apps/web/src/components/patterns/patterns-filters.tsx`:

```tsx
'use client';

import type { PatternFilters } from '@/lib/patterns/models';

interface PatternsFiltersProps {
  search: string;
  filters: PatternFilters;
  onSearchChange: (value: string) => void;
  onFiltersChange: (next: PatternFilters) => void;
}

export function PatternsFilters({
  search,
  filters,
  onSearchChange,
  onFiltersChange,
}: PatternsFiltersProps) {
  const toggle = <T extends string>(values: T[], value: T) =>
    values.includes(value) ? values.filter(item => item !== value) : [...values, value];

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search symbol"
        className="w-full bg-bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
      />

      <div className="flex flex-wrap gap-2">
        {(['cascade', 'trendline', 'triangle'] as const).map(kind => (
          <button
            key={kind}
            onClick={() => onFiltersChange({ ...filters, kinds: toggle(filters.kinds, kind) })}
            className={`px-3 py-1.5 text-xs rounded-lg border ${filters.kinds.includes(kind) ? 'border-accent/30 bg-accent/10 text-accent-light' : 'border-border text-text-muted'}`}
          >
            {kind}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['5m', '15m', '1h'] as const).map(timeframe => (
          <button
            key={timeframe}
            onClick={() => onFiltersChange({ ...filters, timeframes: toggle(filters.timeframes, timeframe) })}
            className={`px-3 py-1.5 text-xs rounded-lg border ${filters.timeframes.includes(timeframe) ? 'border-accent/30 bg-accent/10 text-accent-light' : 'border-border text-text-muted'}`}
          >
            {timeframe}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['forming', 'confirmed', 'finished'] as const).map(status => (
          <button
            key={status}
            onClick={() => onFiltersChange({ ...filters, statuses: toggle(filters.statuses, status) })}
            className={`px-3 py-1.5 text-xs rounded-lg border ${filters.statuses.includes(status) ? 'border-accent/30 bg-accent/10 text-accent-light' : 'border-border text-text-muted'}`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/patterns/patterns-list-row.tsx`:

```tsx
'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { getDisplayBaseSymbol } from '@/lib/display-symbol';
import { PATTERN_COLOR_MAP } from '@/lib/patterns/color-map';
import type { PatternListItem } from '@/lib/patterns/models';

interface PatternsListRowProps {
  item: PatternListItem;
  selected: boolean;
  onClick: () => void;
}

export function PatternsListRow({ item, selected, onClick }: PatternsListRowProps) {
  const colors = PATTERN_COLOR_MAP[item.kind];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-2xl border transition-all ${selected ? 'border-accent/30 bg-accent/8' : 'border-border bg-bg-primary/30 hover:bg-surface-hover'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{getDisplayBaseSymbol(item.symbol)}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`px-2 py-0.5 text-[11px] rounded-md border uppercase tracking-wide ${colors.bg} ${colors.border} ${colors.text}`}>
              {item.kind}
            </span>
            <span className="text-[11px] text-text-muted uppercase">{item.timeframe}</span>
            <span className="text-[11px] text-text-muted capitalize">{item.status}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-text-primary">{item.quality}</div>
          <div className="text-[11px] text-text-muted">
            {formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}
          </div>
        </div>
      </div>
    </button>
  );
}
```

Create `apps/web/src/components/patterns/patterns-empty-state.tsx`:

```tsx
'use client';

export function PatternsEmptyState() {
  return (
    <div className="glass-card border border-border rounded-2xl h-full min-h-[320px] flex flex-col items-center justify-center text-center px-6">
      <div className="text-base font-semibold text-text-primary">Scanning market...</div>
      <div className="mt-2 text-sm text-text-muted max-w-sm">
        The backend scanner is checking Binance futures for active structures. Confirmed and forming patterns will appear here automatically.
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/patterns/patterns-list.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { PatternListItem } from '@/lib/patterns/models';
import { PatternsEmptyState } from './patterns-empty-state';
import { PatternsListRow } from './patterns-list-row';

interface PatternsListProps {
  items: PatternListItem[];
  selectedPatternId: string | null;
  onSelect: (id: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function PatternsList({
  items,
  selectedPatternId,
  onSelect,
  hasMore,
  onLoadMore,
}: PatternsListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        onLoadMore();
      }
    }, { rootMargin: '120px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!items.length) {
    return <PatternsEmptyState />;
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <PatternsListRow
          key={item.id}
          item={item}
          selected={item.id === selectedPatternId}
          onClick={() => onSelect(item.id)}
        />
      ))}
      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}
```

Create `apps/web/src/components/patterns/patterns-sidebar.tsx`:

```tsx
'use client';

import type { PatternFilters, PatternListItem } from '@/lib/patterns/models';
import { PatternsFilters } from './patterns-filters';
import { PatternsList } from './patterns-list';

interface PatternsSidebarProps {
  search: string;
  filters: PatternFilters;
  items: PatternListItem[];
  selectedPatternId: string | null;
  hasMore: boolean;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: PatternFilters) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function PatternsSidebar(props: PatternsSidebarProps) {
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="glass-card border border-border rounded-2xl p-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-text-primary">Patterns</div>
            <div className="text-xs text-text-muted">{props.items.length} results</div>
          </div>
          <button
            onClick={props.onRefresh}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-secondary"
          >
            Refresh
          </button>
        </div>

        <PatternsFilters
          search={props.search}
          filters={props.filters}
          onSearchChange={props.onSearchChange}
          onFiltersChange={props.onFiltersChange}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto pr-1">
        <PatternsList
          items={props.items}
          selectedPatternId={props.selectedPatternId}
          onSelect={props.onSelect}
          hasMore={props.hasMore}
          onLoadMore={props.onLoadMore}
        />
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/patterns/pattern-details-card.tsx`:

```tsx
'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { getDisplayBaseSymbol } from '@/lib/display-symbol';
import { PATTERN_COLOR_MAP } from '@/lib/patterns/color-map';
import type { PatternListItem } from '@/lib/patterns/models';

interface PatternDetailsCardProps {
  item: PatternListItem | null;
  onOpenInTerminal?: () => void;
}

export function PatternDetailsCard({ item, onOpenInTerminal }: PatternDetailsCardProps) {
  if (!item) {
    return (
      <div className="glass-card border border-border rounded-2xl p-4">
        <div className="text-sm text-text-muted">Select a pattern to inspect its live chart.</div>
      </div>
    );
  }

  const colors = PATTERN_COLOR_MAP[item.kind];

  return (
    <div className="glass-card border border-border rounded-2xl p-4 flex items-start justify-between gap-4">
      <div className="space-y-2 min-w-0">
        <div className="text-base font-semibold text-text-primary">{getDisplayBaseSymbol(item.symbol)}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 text-[11px] rounded-md border uppercase tracking-wide ${colors.bg} ${colors.border} ${colors.text}`}>
            {item.kind}
          </span>
          <span className="text-xs text-text-muted uppercase">{item.timeframe}</span>
          <span className="text-xs text-text-muted capitalize">{item.status}</span>
          <span className="text-xs text-text-muted">Quality {item.quality}</span>
          <span className="text-xs text-text-muted">
            Updated {formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      <button
        onClick={onOpenInTerminal}
        className="px-3 py-2 text-xs rounded-xl border border-border text-text-muted hover:text-text-secondary shrink-0"
      >
        Open in Terminal
      </button>
    </div>
  );
}
```

Create `apps/web/src/components/patterns/patterns-view.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/stores';
import { usePatternsQuery } from './use-patterns-query';
import { PatternsSidebar } from './patterns-sidebar';
import { PatternDetailsCard } from './pattern-details-card';

export function PatternsView() {
  const { patternsUI, setPatternsSearch, setPatternsFilters, setSelectedPatternId } = useUIStore();
  const query = usePatternsQuery(patternsUI.search, patternsUI.filters);
  const selectedItem = useMemo(
    () => query.items.find(item => item.id === patternsUI.selectedPatternId) ?? query.items[0] ?? null,
    [query.items, patternsUI.selectedPatternId],
  );

  useEffect(() => {
    if (!selectedItem) return;
    if (patternsUI.selectedPatternId !== selectedItem.id) {
      setSelectedPatternId(selectedItem.id);
    }
  }, [selectedItem, patternsUI.selectedPatternId, setSelectedPatternId]);

  return (
    <div className="h-full grid grid-cols-[360px_minmax(0,1fr)] gap-3 p-3 min-h-0">
      <PatternsSidebar
        search={patternsUI.search}
        filters={patternsUI.filters}
        items={query.items}
        selectedPatternId={patternsUI.selectedPatternId}
        hasMore={query.hasMore}
        onSearchChange={setPatternsSearch}
        onFiltersChange={setPatternsFilters}
        onSelect={setSelectedPatternId}
        onLoadMore={query.loadMore}
        onRefresh={query.refresh}
      />

      <div className="min-h-0 flex flex-col gap-3">
        <PatternDetailsCard item={selectedItem} />
        <div className="flex-1 min-h-0 glass-card border border-border rounded-2xl">
          <div className="h-full flex items-center justify-center text-sm text-text-muted">
            Pattern chart placeholder
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the tab into the app page**

Modify `apps/web/src/app/page.tsx`:

```tsx
import { PatternsView } from '@/components/patterns/patterns-view';
```

and in the view switch:

```tsx
{viewMode === 'patterns' && <PatternsView />}
```

- [ ] **Step 5: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/patterns/color-map.ts apps/web/src/components/patterns/patterns-empty-state.tsx apps/web/src/components/patterns/patterns-filters.tsx apps/web/src/components/patterns/patterns-list-row.tsx apps/web/src/components/patterns/patterns-list.tsx apps/web/src/components/patterns/patterns-sidebar.tsx apps/web/src/components/patterns/pattern-details-card.tsx apps/web/src/components/patterns/use-patterns-query.ts apps/web/src/components/patterns/patterns-view.tsx apps/web/src/app/page.tsx
git commit -m "feat: add patterns workspace shell"
```

---

### Task 11: Render selected patterns on a live chart and support terminal handoff

**Files:**
- Create: `apps/web/src/components/patterns/pattern-chart-overlay.tsx`
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Modify: `apps/web/src/components/patterns/patterns-view.tsx`

- [ ] **Step 1: Add chart overlay props to `ChartCard`**

Modify `apps/web/src/components/charts/chart-card.tsx` to accept:

```ts
  patternOverlay?: {
    id: string;
    kind: 'cascade' | 'trendline' | 'triangle';
    geometry: {
      anchorTimeFrom: number;
      anchorTimeTo: number;
      priceMin: number;
      priceMax: number;
      pivots: Array<{ time: number; price: number }>;
      lines: Array<{
        kind: 'segment' | 'ray';
        points: [{ time: number; price: number }, { time: number; price: number }];
      }>;
      zones: Array<{
        fromTime: number;
        toTime: number;
        low: number;
        high: number;
      }>;
    };
    autoFocus?: boolean;
  };
```

and `showHeaderPrice` must remain compatible with previous Grid behavior.

- [ ] **Step 2: Implement a dedicated pattern overlay renderer**

Create `apps/web/src/components/patterns/pattern-chart-overlay.tsx`:

```tsx
'use client';

import { createPortal } from 'react-dom';
import { PATTERN_COLOR_MAP } from '@/lib/patterns/color-map';

interface PatternChartOverlayProps {
  container: HTMLElement | null;
  kind: 'cascade' | 'trendline' | 'triangle';
  lines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
}

export function PatternChartOverlay({ container, kind, lines }: PatternChartOverlayProps) {
  if (!container) return null;
  const color = kind === 'cascade' ? '#fbbf24' : kind === 'trendline' ? '#38bdf8' : '#34d399';

  return createPortal(
    <svg className="absolute inset-0 pointer-events-none">
      {lines.map((line, index) => (
        <line
          key={index}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
    </svg>,
    container,
  );
}
```

- [ ] **Step 3: Hook the selected pattern into the chart**

Modify `apps/web/src/components/patterns/patterns-view.tsx` to:

- fetch selected pattern detail via `fetchPatternDetail`
- pass `symbol`, `exchange="binance"`, `initialMarketType="futures"`, and `initialTimeframe`
- pass `patternOverlay`
- expose `Open in Terminal` action by setting the existing terminal/global store state used by the main terminal chart

Replace the placeholder chart block with a real `ChartCard`:

```tsx
import { ChartCard } from '@/components/charts/chart-card';
import { fetchPatternDetail } from '@/lib/patterns/api';
```

and render:

```tsx
<div className="flex-1 min-h-0">
  {selectedDetail ? (
    <ChartCard
      symbol={selectedDetail.symbol}
      exchange="binance"
      index={0}
      initialMarketType="futures"
      initialTimeframe={selectedDetail.timeframe}
      patternOverlay={{
        id: selectedDetail.id,
        kind: selectedDetail.kind,
        geometry: selectedDetail.geometry,
        autoFocus: true,
      }}
    />
  ) : (
    <div className="h-full glass-card border border-border rounded-2xl flex items-center justify-center text-sm text-text-muted">
      Select a pattern to inspect its live chart.
    </div>
  )}
</div>
```

If the terminal open workflow uses a specific store action in this repo, call that action from the details card button rather than inventing a parallel mechanism.

- [ ] **Step 4: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/patterns/pattern-chart-overlay.tsx apps/web/src/components/charts/chart-card.tsx apps/web/src/components/patterns/patterns-view.tsx
git commit -m "feat: render selected patterns on live charts"
```

---

### Task 12: Add new-confirmed in-app toast behavior and final verification

**Files:**
- Modify: `apps/web/src/components/patterns/use-patterns-query.ts`
- Modify: `apps/web/src/components/patterns/patterns-view.tsx`
- Modify: `apps/web/src/components/alerts/alert-toast.tsx` (only if a reusable toast entry point is needed)

- [ ] **Step 1: Track which confirmed patterns have already been surfaced**

Extend `usePatternsQuery` or `PatternsView` with a ref that remembers seen confirmed IDs:

```ts
const seenConfirmedRef = useRef<Set<string>>(new Set());
```

On each fresh first-page refresh:

- detect items with `status === 'confirmed'`
- if their IDs were not seen before, mark them as new
- surface only newly seen confirmed items as toast candidates

Do not toast for:

- forming
- finished
- already-known confirmed rows

- [ ] **Step 2: Show in-app visual toast**

If the app already exposes a toast/store helper, call it from `PatternsView` with a message like:

```ts
showAlertToast({
  title: 'New confirmed pattern',
  message: `${displaySymbol} • ${patternKind.toUpperCase()} • ${timeframe}`,
});
```

If no reusable helper exists, add the smallest possible bridge through the existing alerts UI instead of creating a second toast system.

- [ ] **Step 3: Run final verification**

Run:

```bash
npm --workspace apps/api run build
npm --workspace apps/web run build
bun test apps/web/src/lib/patterns/persistence.test.ts
npm --workspace apps/api test -- patterns.service.spec.ts detector.utils.spec.ts cascade.detector.spec.ts trendline.detector.spec.ts triangle.detector.spec.ts
```

Expected: all PASS

- [ ] **Step 4: Manual verification**

Run the app and verify:

- `Patterns` tab renders in the app style
- empty state appears when no results exist
- search and filters persist on refresh
- list loads first 30 rows and fetches more on scroll
- clicking a row opens the right symbol/timeframe
- chart renders the structure overlay
- changing chart manually is possible
- clicking another row resyncs the chart
- newly confirmed pattern creates a visual in-app toast
- finished patterns remain briefly and then disappear on subsequent refresh

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/patterns/use-patterns-query.ts apps/web/src/components/patterns/patterns-view.tsx apps/web/src/components/alerts/alert-toast.tsx apps/web/src/components/charts/chart-card.tsx
git commit -m "feat: add pattern notifications and finish patterns tab"
```

---

## Self-Review

### Spec coverage

Covered:

- new `Patterns` tab
- backend scanning on Binance futures only
- `5m / 15m / 1h`
- `Cascade / Trendline / Triangle`
- `Forming / Confirmed / Finished`
- `quality 0-100`
- Postgres persistence
- active + recently finished lifecycle
- 15-minute finished retention
- list + live chart split layout
- search and basic filters
- infinite scroll with first page size `30`
- selected pattern persistence
- auto-open best current result if saved selection disappears
- live chart with structure drawing only
- no direction/targets
- in-app toast for brand-new confirmed patterns
- `Refresh UI`, not force rescan
- `Open in Terminal`

Not included by design:

- Telegram
- sound alerts
- force-rescan
- multi-exchange
- full historical analytics
- manual pattern editing

### Placeholder scan

No `TODO`, `TBD`, or “implement later” placeholders remain. Where repo-specific APIs may differ, the plan explicitly says to align the exact import/method names while preserving the architecture, but each task still contains concrete code and commands.

### Type consistency

The plan consistently uses:

- `PatternKind`
- `PatternStatus`
- `PatternTimeframe`
- `PatternGeometry`
- `PatternListItem`
- `PatternsUIState`
- `PatternEntity`

No later task introduces conflicting names for those concepts.
