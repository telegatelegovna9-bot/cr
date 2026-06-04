# Liquidity Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current decorative orderbook heatmap with a performant liquidity map that shows background liquidity density, key levels, summary signals, and optional advanced diagnostics without adding chart lag.

**Architecture:** Keep the canvas overlay approach, but split the current heatmap path into three layers: bucket aggregation for the background layer, scored key levels for actionable overlays, and optional diagnostics for advanced users. The render loop must consume a compact precomputed model rather than infer meaning during paint.

**Tech Stack:** Next.js 15, React 19, TypeScript, lightweight-charts, Zustand, node:test, canvas 2D rendering

---

## File Structure

### Existing files to modify

- `apps/web/src/lib/liquidity-engine.ts`
  - keep as orchestration entrypoint
  - remove primary reliance on `real/spoof/iceberg/absorption` for default heatmap
  - expose bucket bands, key levels, and optional diagnostics separately

- `apps/web/src/components/charts/chart-card.tsx`
  - switch heatmap render loop to consume `backgroundBands`, `keyLevels`, and optional diagnostics
  - render compact right-edge labels and summary block

- `apps/web/src/components/charts/heatmap-controls.tsx`
  - replace type-centric controls with user-value controls
  - keep diagnostics toggle as optional advanced setting

- `apps/web/src/stores/index.ts`
  - update heatmap settings shape to match new UX

### New files to create

- `apps/web/src/lib/liquidity-buckets.ts`
  - bucket aggregation primitives
  - price bucketing, active-window filtering, normalized band generation

- `apps/web/src/lib/liquidity-buckets.test.ts`
  - unit tests for bucket generation, aggregation, and gap detection inputs

- `apps/web/src/lib/liquidity-signals.ts`
  - key level scoring
  - magnet, reaction zone, liquidity gap, bias summary derivation

- `apps/web/src/lib/liquidity-signals.test.ts`
  - unit tests for signal extraction and scoring behavior

- `apps/web/src/components/charts/heatmap-summary.tsx`
  - lightweight summary overlay component for key liquidity context

## Task 1: Define the bucket model and its tests

**Files:**
- Create: `apps/web/src/lib/liquidity-buckets.ts`
- Create: `apps/web/src/lib/liquidity-buckets.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiquidityBuckets,
  createBucketWindow,
  mergeBookSideIntoBuckets,
} from './liquidity-buckets';

test('createBucketWindow limits rendering to a bounded price distance from current price', () => {
  const window = createBucketWindow({ currentPrice: 100, depthPct: 0.05 });
  assert.deepEqual(window, { minPrice: 95, maxPrice: 105 });
});

test('mergeBookSideIntoBuckets aggregates multiple levels into the same price bucket', () => {
  const buckets = new Map<number, number>();
  mergeBookSideIntoBuckets({
    buckets,
    levels: [
      { price: 100.01, quantity: 3 },
      { price: 100.04, quantity: 2 },
    ],
    bucketSize: 0.1,
  });

  assert.equal(buckets.size, 1);
  assert.equal(buckets.get(100.0), 5);
});

test('buildLiquidityBuckets returns sorted background bands for visible price window only', () => {
  const bands = buildLiquidityBuckets({
    bids: [
      { price: 99.9, quantity: 4 },
      { price: 92, quantity: 99 },
    ],
    asks: [
      { price: 100.2, quantity: 5 },
      { price: 108, quantity: 77 },
    ],
    currentPrice: 100,
    bucketSize: 0.1,
    depthPct: 0.02,
  });

  assert.deepEqual(
    bands.map(b => b.price),
    [99.9, 100.2],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Write the minimal bucket model**

```ts
export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface LiquidityBand {
  price: number;
  usd: number;
  side: 'bid' | 'ask';
  intensity: number;
}

export function createBucketWindow({ currentPrice, depthPct }: { currentPrice: number; depthPct: number }) {
  return {
    minPrice: currentPrice * (1 - depthPct),
    maxPrice: currentPrice * (1 + depthPct),
  };
}

export function mergeBookSideIntoBuckets({
  buckets,
  levels,
  bucketSize,
}: {
  buckets: Map<number, number>;
  levels: OrderbookLevel[];
  bucketSize: number;
}) {
  for (const level of levels) {
    const bucketPrice = Math.round(level.price / bucketSize) * bucketSize;
    buckets.set(bucketPrice, (buckets.get(bucketPrice) || 0) + level.quantity);
  }
}

export function buildLiquidityBuckets(/* typed args */) {
  // implement bounded aggregation, side-aware band output, intensity normalization
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts
```

Expected:

```text
# pass 3
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/liquidity-buckets.ts apps/web/src/lib/liquidity-buckets.test.ts
git commit -m "feat: add liquidity bucket model"
```

## Task 2: Implement key-level scoring and summary signals

**Files:**
- Create: `apps/web/src/lib/liquidity-signals.ts`
- Create: `apps/web/src/lib/liquidity-signals.test.ts`
- Modify: `apps/web/src/lib/liquidity-buckets.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiquiditySignals,
  summarizeLiquidityBias,
} from './liquidity-signals';

test('buildLiquiditySignals finds strongest levels above and below price', () => {
  const signals = buildLiquiditySignals({
    currentPrice: 100,
    bands: [
      { price: 99.5, usd: 400_000, side: 'bid', intensity: 0.8 },
      { price: 98.8, usd: 120_000, side: 'bid', intensity: 0.4 },
      { price: 100.8, usd: 900_000, side: 'ask', intensity: 1.0 },
      { price: 101.4, usd: 250_000, side: 'ask', intensity: 0.5 },
    ],
  });

  assert.equal(signals.topAbove?.price, 100.8);
  assert.equal(signals.topBelow?.price, 99.5);
  assert.equal(signals.nearestMagnet?.price, 100.8);
});

test('summarizeLiquidityBias reports pull-up when upper liquidity dominates nearby lower liquidity', () => {
  const bias = summarizeLiquidityBias({
    currentPrice: 100,
    topAbove: { price: 100.5, usd: 1_000_000 },
    topBelow: { price: 99.7, usd: 200_000 },
  });

  assert.equal(bias, 'pull up');
});

test('buildLiquiditySignals detects a liquidity gap between dense regions', () => {
  const signals = buildLiquiditySignals({
    currentPrice: 100,
    bands: [
      { price: 99.8, usd: 700_000, side: 'bid', intensity: 0.9 },
      { price: 100.9, usd: 800_000, side: 'ask', intensity: 1.0 },
    ],
  });

  assert.equal(signals.gaps.length > 0, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Write the minimal signal extractor**

```ts
export interface KeyLevel {
  price: number;
  usd: number;
  side: 'bid' | 'ask';
  label: 'Liquidity Above' | 'Liquidity Below' | 'Nearest Magnet' | 'Reaction Zone';
}

export interface LiquidityGap {
  fromPrice: number;
  toPrice: number;
}

export interface LiquiditySignals {
  topAbove: KeyLevel | null;
  topBelow: KeyLevel | null;
  nearestMagnet: KeyLevel | null;
  reactionZones: KeyLevel[];
  gaps: LiquidityGap[];
  bias: 'pull up' | 'pull down' | 'balanced';
}

export function buildLiquiditySignals(/* typed args */): LiquiditySignals {
  // compute side split, local dominance, proximity-weighted scoring, gap detection
}

export function summarizeLiquidityBias(/* typed args */): LiquiditySignals['bias'] {
  // compare strongest nearby liquidity above vs below
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
# pass 3
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/liquidity-buckets.ts apps/web/src/lib/liquidity-signals.ts apps/web/src/lib/liquidity-signals.test.ts
git commit -m "feat: add liquidity key level scoring"
```

## Task 3: Refactor the heatmap engine around bands, signals, and diagnostics

**Files:**
- Modify: `apps/web/src/lib/liquidity-engine.ts`
- Test: `apps/web/src/lib/liquidity-buckets.test.ts`
- Test: `apps/web/src/lib/liquidity-signals.test.ts`

- [ ] **Step 1: Write the failing engine test**

Add this test to `apps/web/src/lib/liquidity-buckets.test.ts`:

```ts
import { LiquidityEngine } from './liquidity-engine';

test('LiquidityEngine exposes background bands and key levels separately', () => {
  const engine = new LiquidityEngine();
  engine.setPriceStep(0.1);
  engine.addUpdate(
    [{ price: 99.9, quantity: 8 }],
    [{ price: 100.6, quantity: 12 }],
    100,
    1_000,
  );

  const model = engine.getRenderModel({
    currentPrice: 100,
    depthPct: 0.03,
    minSizeUsd: 0,
    intensity: 1,
    diagnosticsEnabled: false,
  });

  assert.equal(model.backgroundBands.length > 0, true);
  assert.equal(model.keyLevels.length > 0, true);
  assert.equal(model.diagnostics.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
TypeError: engine.getRenderModel is not a function
```

- [ ] **Step 3: Implement the new engine API**

```ts
export interface HeatmapRenderModel {
  backgroundBands: Array<{
    price: number;
    side: 'bid' | 'ask';
    intensity: number;
    opacity: number;
    usd: number;
  }>;
  keyLevels: Array<{
    price: number;
    side: 'bid' | 'ask';
    kind: 'magnet' | 'reaction';
    usd: number;
    label: string;
  }>;
  diagnostics: Array<{
    price: number;
    side: 'bid' | 'ask';
    kind: 'spoof' | 'iceberg' | 'absorption';
    confidence: number;
  }>;
  summary: {
    topAbove: { price: number; usd: number } | null;
    topBelow: { price: number; usd: number } | null;
    bias: 'pull up' | 'pull down' | 'balanced';
  };
}

getRenderModel(settings: {
  currentPrice: number;
  depthPct: number;
  minSizeUsd: number;
  intensity: number;
  diagnosticsEnabled: boolean;
}): HeatmapRenderModel {
  // feed tracked levels into buckets, signals, and optional diagnostics
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
# pass
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/liquidity-engine.ts apps/web/src/lib/liquidity-buckets.test.ts apps/web/src/lib/liquidity-signals.test.ts
git commit -m "refactor: split liquidity engine into bands and signals"
```

## Task 4: Replace the chart heatmap rendering path

**Files:**
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Create: `apps/web/src/components/charts/heatmap-summary.tsx`
- Test: `apps/web/src/lib/liquidity-buckets.test.ts`

- [ ] **Step 1: Write the failing summary component test**

Create this test in `apps/web/src/lib/liquidity-signals.test.ts`:

```ts
test('buildLiquiditySignals returns balanced bias when upper and lower liquidity are comparable', () => {
  const signals = buildLiquiditySignals({
    currentPrice: 100,
    bands: [
      { price: 99.7, usd: 500_000, side: 'bid', intensity: 0.8 },
      { price: 100.4, usd: 520_000, side: 'ask', intensity: 0.82 },
    ],
  });

  assert.equal(signals.bias, 'balanced');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Implement chart rendering and summary overlay**

Create `apps/web/src/components/charts/heatmap-summary.tsx`:

```tsx
type HeatmapSummaryProps = {
  topAbove: { price: number; usd: number } | null;
  topBelow: { price: number; usd: number } | null;
  bias: 'pull up' | 'pull down' | 'balanced';
};

export function HeatmapSummary({ topAbove, topBelow, bias }: HeatmapSummaryProps) {
  return (
    <div className="absolute top-2 right-2 z-20 rounded-lg border border-white/10 bg-black/55 px-2 py-1 text-[10px] text-white/80">
      {/* compact summary rows */}
    </div>
  );
}
```

Update `chart-card.tsx` to:

```ts
const renderModel = engine.getRenderModel({
  currentPrice: heatmapPriceRef.current,
  depthPct: heatmapSettingsRef.current.depthPct,
  minSizeUsd: heatmapSettingsRef.current.minSizeUsd,
  intensity: heatmapSettingsRef.current.intensity,
  diagnosticsEnabled: heatmapSettingsRef.current.showDiagnostics,
});

for (const band of renderModel.backgroundBands) {
  // draw soft full-width heat background
}

for (const level of renderModel.keyLevels) {
  // draw thin level line and compact right-edge label
}
```

- [ ] **Step 4: Run the tests and web build**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
npm --workspace apps/web run build
```

Expected:

```text
# pass
Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/chart-card.tsx apps/web/src/components/charts/heatmap-summary.tsx apps/web/src/lib/liquidity-signals.test.ts
git commit -m "feat: render key liquidity levels on chart"
```

## Task 5: Redesign heatmap controls and settings model

**Files:**
- Modify: `apps/web/src/components/charts/heatmap-controls.tsx`
- Modify: `apps/web/src/stores/index.ts`
- Test: `apps/web/src/lib/liquidity-buckets.test.ts`

- [ ] **Step 1: Write the failing settings test**

Add this test to `apps/web/src/lib/liquidity-buckets.test.ts`:

```ts
test('default heatmap settings expose depth window and diagnostics toggle', async () => {
  const { DEFAULT_HEATMAP_SETTINGS } = await import('./liquidity-engine');
  assert.equal(typeof DEFAULT_HEATMAP_SETTINGS.depthPct, 'number');
  assert.equal(typeof DEFAULT_HEATMAP_SETTINGS.showDiagnostics, 'boolean');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Replace the settings schema and controls**

Update `HeatmapSettings` in `liquidity-engine.ts`:

```ts
export interface HeatmapSettings {
  intensity: number;
  minSizeUsd: number;
  depthPct: number;
  autoFade: boolean;
  showDiagnostics: boolean;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  intensity: 1,
  minSizeUsd: 50_000,
  depthPct: 0.03,
  autoFade: true,
  showDiagnostics: false,
};
```

Update `heatmap-controls.tsx` to expose:

```tsx
// intensity slider
// min liquidity options
// visible depth options: 1%, 2%, 3%, 5%
// diagnostics toggle
```

- [ ] **Step 4: Run the tests and web build**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts
npm --workspace apps/web run build
```

Expected:

```text
# pass
Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/liquidity-engine.ts apps/web/src/components/charts/heatmap-controls.tsx apps/web/src/stores/index.ts apps/web/src/lib/liquidity-buckets.test.ts
git commit -m "feat: simplify heatmap controls for liquidity workflow"
```

## Task 6: Add advanced diagnostics as a quiet secondary layer

**Files:**
- Modify: `apps/web/src/lib/liquidity-engine.ts`
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Test: `apps/web/src/lib/liquidity-signals.test.ts`

- [ ] **Step 1: Write the failing diagnostics test**

Add this test to `apps/web/src/lib/liquidity-signals.test.ts`:

```ts
import { LiquidityEngine } from './liquidity-engine';

test('diagnostics stay empty unless diagnostics are enabled', () => {
  const engine = new LiquidityEngine();
  engine.setPriceStep(0.1);
  engine.addUpdate(
    [{ price: 99.9, quantity: 15 }],
    [{ price: 100.5, quantity: 18 }],
    100,
    1_000,
  );

  const off = engine.getRenderModel({
    currentPrice: 100,
    depthPct: 0.03,
    minSizeUsd: 0,
    intensity: 1,
    diagnosticsEnabled: false,
  });
  const on = engine.getRenderModel({
    currentPrice: 100,
    depthPct: 0.03,
    minSizeUsd: 0,
    intensity: 1,
    diagnosticsEnabled: true,
  });

  assert.equal(off.diagnostics.length, 0);
  assert.equal(Array.isArray(on.diagnostics), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Implement subtle diagnostics rendering**

Update `liquidity-engine.ts`:

```ts
// diagnostics stay secondary, confidence-scored, optional
// keep spoof/iceberg/absorption heuristics only for optional markers
```

Update `chart-card.tsx`:

```ts
for (const marker of renderModel.diagnostics) {
  // draw minimal tick, dot, or short dashed marker
  // never repaint full-width bands from diagnostics
}
```

- [ ] **Step 4: Run the tests and web build**

Run:

```bash
node --test apps/web/src/lib/liquidity-signals.test.ts
npm --workspace apps/web run build
```

Expected:

```text
# pass
Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/liquidity-engine.ts apps/web/src/components/charts/chart-card.tsx apps/web/src/lib/liquidity-signals.test.ts
git commit -m "feat: add optional advanced liquidity diagnostics"
```

## Task 7: Final verification and deployment prep

**Files:**
- Modify: `docs/superpowers/plans/2026-06-04-liquidity-heatmap-implementation.md`

- [ ] **Step 1: Run the focused tests**

Run:

```bash
node --test apps/web/src/lib/liquidity-buckets.test.ts
node --test apps/web/src/lib/liquidity-signals.test.ts
node --test apps/web/src/components/charts/chart-history.test.ts
```

Expected:

```text
# pass
```

- [ ] **Step 2: Run the app build checks**

Run:

```bash
npm --workspace apps/web run build
npm --workspace apps/api run build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 3: Manual runtime checklist**

Verify:

```text
- heatmap toggles on/off without freezing chart
- candles remain visually primary
- labels stay readable on desktop widths
- no recursive redraw or infinite history behavior
- Bitget, OKX, Binance charts still open normally
- multiple charts with heatmap enabled remain responsive
```

- [ ] **Step 4: Commit final polish**

```bash
git add apps/web/src/lib apps/web/src/components/charts apps/web/src/stores/index.ts
git commit -m "feat: ship redesigned liquidity heatmap"
```

## Spec Coverage Check

- Background density layer: covered by Tasks 1, 3, and 4
- Key levels layer: covered by Tasks 2, 3, and 4
- Context summary: covered by Task 4
- Simpler control model: covered by Task 5
- Advanced diagnostics as optional secondary layer: covered by Task 6
- Performance constraints and bounded rendering: covered by Tasks 1, 3, 4, and 7

## Placeholder Scan

- No `TODO`
- No `TBD`
- No deferred “implement later” steps
- All changed code paths and test commands are spelled out

## Type Consistency Check

- `HeatmapSettings` consistently uses `depthPct` and `showDiagnostics`
- `HeatmapRenderModel` consistently uses `backgroundBands`, `keyLevels`, and `diagnostics`
- summary bias values consistently use `pull up`, `pull down`, `balanced`
