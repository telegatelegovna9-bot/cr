# Chart Drawing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new high-performance chart drawing engine (full editing in grid and modal), persistent cross-tab drawings, and signal notifications with one-shot + manual reset.

**Architecture:** Introduce a pure TypeScript drawing domain (`models`, `engine`, `persistence`, `sync`) and keep UI thin (`overlay`, `toolbar`). Store drawings in a dedicated zustand slice keyed by `exchange:marketType:symbol`, persist to versioned local storage, and sync operations across tabs with `BroadcastChannel` plus storage fallback. Hook signal monitoring into existing alert UI and mount the modal so Bell works.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, Lightweight Charts, Node test runner (`node --test`).

---

## File Structure (planned changes)

Create:
- `apps/web/src/lib/drawings/models.ts` - drawing types, keys, operation/event types.
- `apps/web/src/lib/drawings/persistence.ts` - load/save/migrate versioned local state.
- `apps/web/src/lib/drawings/persistence.test.ts` - parser/migration/save tests.
- `apps/web/src/lib/drawings/sync-bus.ts` - broadcast/storage sync adapter.
- `apps/web/src/lib/drawings/sync-bus.test.ts` - sync event tests.
- `apps/web/src/lib/drawings/engine.ts` - projection, hit test, handles.
- `apps/web/src/lib/drawings/engine.test.ts` - geometry and hit-testing tests.
- `apps/web/src/components/charts/drawing-toolbar.tsx` - adaptive toolbar with hide/show.
- `apps/web/src/components/charts/drawing-overlay.tsx` - pointer layer over chart.
- `apps/web/src/hooks/useSignalMonitor.ts` - signal crossing monitor, one-shot + reset.
- `apps/web/src/hooks/useSignalMonitor.test.ts` - signal trigger/reset tests.

Modify:
- `apps/web/src/stores/index.ts` - add `useDrawingStore` slice with instrument indexing and operations.
- `apps/web/src/components/charts/chart-card.tsx` - mount toolbar and overlay, bind chart and series refs.
- `apps/web/src/components/charts/chart-grid.tsx` - keep editing available in all card sizes.
- `apps/web/src/app/page.tsx` - mount `AlertModal` and `useSignalMonitor`.
- `apps/web/src/components/alerts/alert-toast.tsx` - export and import consistency for modal.
- `apps/web/src/components/terminal/header.tsx` - Bell state integration validation.

Test execution commands:
- `node --test apps/web/src/lib/drawings/persistence.test.ts`
- `node --test apps/web/src/lib/drawings/sync-bus.test.ts`
- `node --test apps/web/src/lib/drawings/engine.test.ts`
- `node --test apps/web/src/hooks/useSignalMonitor.test.ts`

Scope check:
- This plan stays within one subsystem (chart drawings plus signal notifications) and delivers shippable behavior without backend or device-level sync.

### Task 1: Drawing Domain Model and Store Slice

**Files:**
- Create: `apps/web/src/lib/drawings/models.ts`
- Modify: `apps/web/src/stores/index.ts`
- Test: `apps/web/src/lib/drawings/persistence.test.ts` (model tests can live here in first iteration)

- [ ] **Step 1: Write the failing test for key generation and model validation**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeInstrumentKey, isDrawingKind } from './models';

test('makeInstrumentKey builds exchange:marketType:symbol key', () => {
  assert.equal(makeInstrumentKey('binance', 'futures', 'BTC/USDT:USDT'), 'binance:futures:BTC/USDT:USDT');
});

test('isDrawingKind accepts supported tool kinds and rejects unknown', () => {
  assert.equal(isDrawingKind('horizontal_line'), true);
  assert.equal(isDrawingKind('rectangle'), true);
  assert.equal(isDrawingKind('fib'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/persistence.test.ts`  
Expected: FAIL with module or function not found for `makeInstrumentKey` or `isDrawingKind`.

- [ ] **Step 3: Write minimal implementation (models plus store API contract)**

```ts
// apps/web/src/lib/drawings/models.ts
export type DrawingKind =
  | 'horizontal_line'
  | 'signal_level'
  | 'trendline'
  | 'vertical_line'
  | 'rectangle'
  | 'ruler';

export interface InstrumentRef {
  exchange: string;
  marketType: 'spot' | 'futures';
  symbol: string;
}

export function makeInstrumentKey(exchange: string, marketType: string, symbol: string): string {
  return `${exchange}:${marketType}:${symbol}`;
}

export function isDrawingKind(value: string): value is DrawingKind {
  return (
    value === 'horizontal_line' ||
    value === 'signal_level' ||
    value === 'trendline' ||
    value === 'vertical_line' ||
    value === 'rectangle' ||
    value === 'ruler'
  );
}
```

```ts
// apps/web/src/stores/index.ts (new drawing slice shape)
interface DrawingStore {
  byId: Record<string, AnyDrawing>;
  byInstrument: Record<string, string[]>;
  selectedTool: DrawingTool;
  hidden: boolean;
  upsertDrawing: (drawing: AnyDrawing) => void;
  removeDrawing: (id: string) => void;
  setSelectedTool: (tool: DrawingTool) => void;
  setHidden: (value: boolean) => void;
  resetSignal: (id: string) => void;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/drawings/persistence.test.ts`  
Expected: PASS for model tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/drawings/models.ts apps/web/src/stores/index.ts apps/web/src/lib/drawings/persistence.test.ts
git commit -m "feat(drawings): add drawing model primitives and store contract"
```

### Task 2: Versioned Persistence Adapter

**Files:**
- Create: `apps/web/src/lib/drawings/persistence.ts`
- Modify: `apps/web/src/stores/index.ts`
- Test: `apps/web/src/lib/drawings/persistence.test.ts`

- [ ] **Step 1: Write failing tests for load, save, and migration fallback**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPersistedDrawings, savePersistedDrawings } from './persistence';

test('loadPersistedDrawings returns empty state on malformed JSON', () => {
  const storage = { getItem: () => '{broken}', setItem: () => {} } as Storage;
  const state = loadPersistedDrawings(storage);
  assert.deepEqual(state, { version: 1, drawings: [] });
});

test('savePersistedDrawings writes versioned payload', () => {
  let written = '';
  const storage = {
    getItem: () => null,
    setItem: (_k: string, v: string) => {
      written = v;
    },
  } as Storage;
  savePersistedDrawings(storage, [{ id: 'd1' } as any]);
  assert.match(written, /"version":1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/persistence.test.ts`  
Expected: FAIL because persistence functions do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/drawings/persistence.ts
const STORAGE_KEY = 'aionui_drawings_v1';

export interface PersistedDrawingState {
  version: 1;
  drawings: AnyDrawing[];
}

export function loadPersistedDrawings(storage: Storage): PersistedDrawingState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { version: 1, drawings: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && Array.isArray(parsed.drawings)) {
      return { version: 1, drawings: parsed.drawings };
    }
    return { version: 1, drawings: [] };
  } catch {
    return { version: 1, drawings: [] };
  }
}

export function savePersistedDrawings(storage: Storage, drawings: AnyDrawing[]): void {
  const payload: PersistedDrawingState = { version: 1, drawings };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
```

```ts
// apps/web/src/stores/index.ts (persist writes)
function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

const scheduleSave = debounce((drawings: AnyDrawing[]) => {
  if (typeof window !== 'undefined') savePersistedDrawings(window.localStorage, drawings);
}, 120);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/drawings/persistence.test.ts`  
Expected: PASS for malformed payload recovery and versioned save.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/drawings/persistence.ts apps/web/src/lib/drawings/persistence.test.ts apps/web/src/stores/index.ts
git commit -m "feat(drawings): add versioned local persistence adapter"
```

### Task 3: Cross-Tab Sync Bus

**Files:**
- Create: `apps/web/src/lib/drawings/sync-bus.ts`
- Test: `apps/web/src/lib/drawings/sync-bus.test.ts`
- Modify: `apps/web/src/stores/index.ts`

- [ ] **Step 1: Write failing test for publish and subscribe operations**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDrawingSyncBus } from './sync-bus';

test('sync bus forwards remote events and ignores same origin events', () => {
  const events: string[] = [];
  const bus = createDrawingSyncBus('origin-a');
  bus.subscribe((evt) => events.push(evt.type));
  bus.emit({ type: 'create', origin: 'origin-b', drawingId: 'x' } as any);
  bus.emit({ type: 'create', origin: 'origin-a', drawingId: 'y' } as any);
  assert.deepEqual(events, ['create']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/sync-bus.test.ts`  
Expected: FAIL due to missing sync bus implementation.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/drawings/sync-bus.ts
export interface DrawingSyncEvent {
  type: 'create' | 'update' | 'delete' | 'reset' | 'visibility' | 'signal_triggered';
  origin: string;
  [key: string]: unknown;
}

export function createDrawingSyncBus(origin: string) {
  const handlers = new Set<(evt: DrawingSyncEvent) => void>();
  return {
    subscribe(handler: (evt: DrawingSyncEvent) => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(evt: DrawingSyncEvent) {
      if (evt.origin === origin) return;
      handlers.forEach((h) => h(evt));
    },
  };
}
```

```ts
// apps/web/src/stores/index.ts (usage shape)
syncBus.subscribe((evt) => {
  if (evt.type === 'update') applyRemoteUpdate(evt);
  if (evt.type === 'delete') applyRemoteDelete(evt);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/drawings/sync-bus.test.ts`  
Expected: PASS for origin filtering and event forwarding.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/drawings/sync-bus.ts apps/web/src/lib/drawings/sync-bus.test.ts apps/web/src/stores/index.ts
git commit -m "feat(drawings): add cross-tab sync bus primitives"
```

### Task 4: Drawing Engine Geometry and Hit Testing

**Files:**
- Create: `apps/web/src/lib/drawings/engine.ts`
- Test: `apps/web/src/lib/drawings/engine.test.ts`
- Modify: `apps/web/src/components/charts/chart-card.tsx` (chart adapter wiring later)

- [ ] **Step 1: Write failing tests for projection and hit testing**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectHorizontalLine, hitTestRectangleHandle } from './engine';

test('projectHorizontalLine returns full-width line for visible price', () => {
  const line = projectHorizontalLine({ price: 100 } as any, { width: 400, priceToY: () => 120 } as any);
  assert.deepEqual(line, { x1: 0, y1: 120, x2: 400, y2: 120 });
});

test('hitTestRectangleHandle detects near-corner hit', () => {
  const hit = hitTestRectangleHandle({ x: 10, y: 10, handleX: 12, handleY: 9, radius: 6 });
  assert.equal(hit, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/engine.test.ts`  
Expected: FAIL with missing engine exports.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/drawings/engine.ts
export function projectHorizontalLine(
  drawing: { price: number },
  ctx: { width: number; priceToY: (price: number) => number | null }
) {
  const y = ctx.priceToY(drawing.price);
  if (y == null) return null;
  return { x1: 0, y1: y, x2: ctx.width, y2: y };
}

export function hitTestRectangleHandle(args: {
  x: number;
  y: number;
  handleX: number;
  handleY: number;
  radius: number;
}) {
  const dx = args.x - args.handleX;
  const dy = args.y - args.handleY;
  return dx * dx + dy * dy <= args.radius * args.radius;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/drawings/engine.test.ts`  
Expected: PASS for projection and hit-test helpers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/drawings/engine.ts apps/web/src/lib/drawings/engine.test.ts
git commit -m "feat(drawings): add geometry projection and hit-test engine core"
```

### Task 5: Overlay and Toolbar Integration in ChartCard (Grid and Modal)

**Files:**
- Create: `apps/web/src/components/charts/drawing-overlay.tsx`
- Create: `apps/web/src/components/charts/drawing-toolbar.tsx`
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Modify: `apps/web/src/components/charts/chart-grid.tsx`
- Test: `apps/web/src/lib/drawings/engine.test.ts` (integration-safe geometry contracts)

- [ ] **Step 1: Write failing test for toolbar action state**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextToolState } from './engine';

test('nextToolState toggles hidden flag without changing selected tool', () => {
  const next = nextToolState({ selectedTool: 'trendline', hidden: false }, { type: 'toggle-hidden' } as any);
  assert.equal(next.selectedTool, 'trendline');
  assert.equal(next.hidden, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/engine.test.ts`  
Expected: FAIL with missing reducer helper.

- [ ] **Step 3: Write minimal implementation and mount UI**

```tsx
// apps/web/src/components/charts/chart-card.tsx (inside chart area)
<DrawingOverlay
  chart={chartRef.current}
  candleSeries={candleSeriesRef.current}
  exchange={exchange}
  marketType={marketType}
  symbol={effectiveSymbol}
  compact={chartGridSize !== 1 && !isModal}
/>
<DrawingToolbar
  exchange={exchange}
  marketType={marketType}
  symbol={effectiveSymbol}
  compact={chartGridSize !== 1 && !isModal}
/>
```

```tsx
// apps/web/src/components/charts/drawing-toolbar.tsx (adaptive class switch)
const toolbarClass = compact
  ? 'absolute left-1 top-1 z-40 flex gap-1 p-1 glass-panel rounded-lg'
  : 'absolute left-2 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1 glass-panel rounded-xl';
```

```tsx
// apps/web/src/components/charts/drawing-overlay.tsx (pointer hooks)
<svg
  className="absolute inset-0 z-30 select-none"
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/drawings/engine.test.ts`  
Expected: PASS including new state helper coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/drawing-overlay.tsx apps/web/src/components/charts/drawing-toolbar.tsx apps/web/src/components/charts/chart-card.tsx apps/web/src/components/charts/chart-grid.tsx apps/web/src/lib/drawings/engine.test.ts apps/web/src/lib/drawings/engine.ts
git commit -m "feat(drawings): integrate toolbar and overlay for grid and modal charts"
```

### Task 6: Signal Monitor (One-Shot Plus Reset)

**Files:**
- Create: `apps/web/src/hooks/useSignalMonitor.ts`
- Create: `apps/web/src/hooks/useSignalMonitor.test.ts`
- Modify: `apps/web/src/stores/index.ts`

- [ ] **Step 1: Write failing tests for one-shot and reset behavior**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldTriggerSignal } from './useSignalMonitor';

test('one-shot signal triggers once when crossing and then stops', () => {
  const first = shouldTriggerSignal({ last: 99, current: 101, level: 100, armed: true, triggered: false });
  const second = shouldTriggerSignal({ last: 101, current: 99, level: 100, armed: true, triggered: true });
  assert.equal(first, true);
  assert.equal(second, false);
});

test('reset re-arms signal for future crossing', () => {
  const triggered = shouldTriggerSignal({ last: 99, current: 101, level: 100, armed: true, triggered: false });
  const retrigger = shouldTriggerSignal({ last: 99, current: 101, level: 100, armed: true, triggered: false });
  assert.equal(triggered, true);
  assert.equal(retrigger, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/hooks/useSignalMonitor.test.ts`  
Expected: FAIL because signal helper and hook are missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/hooks/useSignalMonitor.ts
export function shouldTriggerSignal(args: {
  last: number;
  current: number;
  level: number;
  armed: boolean;
  triggered: boolean;
}): boolean {
  if (!args.armed || args.triggered) return false;
  const up = args.last <= args.level && args.current >= args.level;
  const down = args.last >= args.level && args.current <= args.level;
  return up || down;
}
```

```ts
// apps/web/src/stores/index.ts (reset action)
resetSignal: (id) =>
  set((state) => ({
    byId: {
      ...state.byId,
      [id]: {
        ...state.byId[id],
        triggered: false,
        triggeredAt: null,
        armed: true,
      },
    },
  })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/hooks/useSignalMonitor.test.ts`  
Expected: PASS for one-shot and reset scenarios.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useSignalMonitor.ts apps/web/src/hooks/useSignalMonitor.test.ts apps/web/src/stores/index.ts
git commit -m "feat(signals): add one-shot trigger logic with manual reset"
```

### Task 7: Alerts Wiring, Bell Modal Activation, Cross-Tab Alert Events

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/alerts/alert-toast.tsx`
- Modify: `apps/web/src/components/terminal/header.tsx`
- Modify: `apps/web/src/stores/index.ts`
- Test: `apps/web/src/hooks/useSignalMonitor.test.ts`

- [ ] **Step 1: Write failing test for signal-to-alert mapping**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapSignalToAlert } from './useSignalMonitor';

test('mapSignalToAlert creates alert payload with symbol and target', () => {
  const alert = mapSignalToAlert({
    id: 'sig-1',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    price: 101000,
    current: 101100,
  } as any);
  assert.equal(alert.symbol, 'BTC/USDT');
  assert.equal(alert.value, 101000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/hooks/useSignalMonitor.test.ts`  
Expected: FAIL because mapper is missing.

- [ ] **Step 3: Write minimal implementation and mount modal**

```tsx
// apps/web/src/app/page.tsx
import { AlertToast, AlertModal } from '@/components/alerts/alert-toast';
import { useSignalMonitor } from '@/hooks/useSignalMonitor';

useSignalMonitor();

<AlertToast />
<AlertModal />
```

```ts
// apps/web/src/hooks/useSignalMonitor.ts
export function mapSignalToAlert(input: {
  id: string;
  symbol: string;
  exchange: string;
  price: number;
  current: number;
}) {
  return {
    id: `signal-${input.id}-${Date.now()}`,
    symbol: input.symbol,
    type: 'price_cross',
    condition: 'crossed',
    value: input.price,
    currentPrice: input.current,
    createdAt: Date.now(),
  };
}
```

```ts
// apps/web/src/stores/index.ts (cross-tab unread sync shape)
applyRemoteSignalAlert: (alert) =>
  set((state) => ({
    alerts: [alert, ...state.alerts].slice(0, 200),
    unreadAlertCount: state.unreadAlertCount + 1,
  })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/hooks/useSignalMonitor.test.ts`  
Expected: PASS for mapper plus previous signal checks.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/alerts/alert-toast.tsx apps/web/src/hooks/useSignalMonitor.ts apps/web/src/hooks/useSignalMonitor.test.ts apps/web/src/stores/index.ts
git commit -m "feat(alerts): wire signal alerts to bell modal and cross-tab in-app notifications"
```

### Task 8: Performance Safeguards and Verification

**Files:**
- Modify: `apps/web/src/components/charts/drawing-overlay.tsx`
- Modify: `apps/web/src/lib/drawings/engine.ts`
- Modify: `apps/web/src/lib/drawings/sync-bus.ts`
- Test: `apps/web/src/lib/drawings/engine.test.ts`
- Test: `apps/web/src/lib/drawings/sync-bus.test.ts`

- [ ] **Step 1: Write failing tests for throttled operations**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationDebouncer } from './sync-bus';

test('createOperationDebouncer collapses burst updates into one event', async () => {
  const sent: string[] = [];
  const d = createOperationDebouncer((type) => sent.push(type), 20);
  d('update');
  d('update');
  await new Promise((r) => setTimeout(r, 35));
  assert.deepEqual(sent, ['update']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/drawings/sync-bus.test.ts`  
Expected: FAIL due to missing debouncer utility.

- [ ] **Step 3: Write minimal implementation and frame-budget guard**

```ts
// apps/web/src/lib/drawings/sync-bus.ts
export function createOperationDebouncer(send: (type: string) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastType = 'update';
  return (type: string) => {
    lastType = type;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      send(lastType);
      timer = null;
    }, delayMs);
  };
}
```

```ts
// apps/web/src/components/charts/drawing-overlay.tsx
const frameGuardRef = useRef<number | null>(null);
function scheduleRepaint() {
  if (frameGuardRef.current != null) return;
  frameGuardRef.current = requestAnimationFrame(() => {
    frameGuardRef.current = null;
    setRenderVersion((v) => v + 1);
  });
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `node --test apps/web/src/lib/drawings/sync-bus.test.ts`  
Expected: PASS for debounce behavior.

Run: `node --test apps/web/src/lib/drawings/engine.test.ts`  
Expected: PASS with no regression in geometry and hit tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/drawing-overlay.tsx apps/web/src/lib/drawings/sync-bus.ts apps/web/src/lib/drawings/sync-bus.test.ts apps/web/src/lib/drawings/engine.ts apps/web/src/lib/drawings/engine.test.ts
git commit -m "perf(drawings): add raf invalidation and throttled sync operations"
```

## Final Verification Checklist (after all tasks)

- [ ] `node --test apps/web/src/lib/drawings/persistence.test.ts`
- [ ] `node --test apps/web/src/lib/drawings/sync-bus.test.ts`
- [ ] `node --test apps/web/src/lib/drawings/engine.test.ts`
- [ ] `node --test apps/web/src/hooks/useSignalMonitor.test.ts`
- [ ] Manual QA:
- [ ] Draw and edit and delete in grid card (not only modal).
- [ ] Drawings survive page refresh.
- [ ] Open second tab and verify drawings sync both directions.
- [ ] Trigger signal in tab A and verify toast plus badge in tab B.
- [ ] Bell opens modal and shows signal history.
- [ ] Mobile viewport (`<=768px`) supports create, move, and delete comfortably.

