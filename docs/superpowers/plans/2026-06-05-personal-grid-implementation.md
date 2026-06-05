# Personal Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first personal `Grid` workspace with up to six user-configured chart slots, add/replace/remove actions, and a non-destructive expanded chart mode.

**Architecture:** Add a dedicated personal-grid state slice and local persistence helpers, then render the `Grid` tab through a new personal-grid view instead of the current auto-sorted `ChartGrid`. Reuse `ChartCard` for chart rendering and keep picker, slots, and persistence logic isolated so account sync can be added later.

**Tech Stack:** Next.js App Router, React client components, Zustand store, existing `ChartCard`, TypeScript, localStorage persistence, Framer Motion, Lucide icons

---

## File Structure

### Existing files to modify

- `apps/web/src/stores/index.ts`
  - Add a dedicated personal grid store slice and actions.
- `apps/web/src/app/page.tsx`
  - Route `viewMode === 'grid'` to the new personal grid view.
- `apps/web/src/components/terminal/header.tsx`
  - Keep current tab button wiring, but ensure terminology still fits the personal-grid behavior if any copy needs adjustment.

### New files to create

- `apps/web/src/lib/personal-grid/persistence.ts`
  - localStorage load/save helpers and payload validation.
- `apps/web/src/lib/personal-grid/persistence.test.ts`
  - persistence tests for load/save/default state behavior.
- `apps/web/src/lib/personal-grid/models.ts`
  - shared personal-grid types, defaults, and slot helpers.
- `apps/web/src/components/grid/personal-grid-view.tsx`
  - top-level view for the personal grid tab.
- `apps/web/src/components/grid/personal-grid-slot.tsx`
  - slot wrapper handling empty/filled/expanded visual states.
- `apps/web/src/components/grid/chart-picker-modal.tsx`
  - add/replace chart picker modal.

### Existing files to reuse without structural change

- `apps/web/src/components/charts/chart-card.tsx`
  - reused as-is for rendering configured charts.
- `apps/web/src/components/charts/chart-grid.tsx`
  - kept intact as the old market-sorted auto grid implementation until no longer needed elsewhere.

---

### Task 1: Define personal-grid models and persistence

**Files:**
- Create: `apps/web/src/lib/personal-grid/models.ts`
- Create: `apps/web/src/lib/personal-grid/persistence.ts`
- Create: `apps/web/src/lib/personal-grid/persistence.test.ts`

- [ ] **Step 1: Write the failing persistence tests**

Create `apps/web/src/lib/personal-grid/persistence.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PERSONAL_GRID_STATE,
  createEmptyPersonalGridState,
} from './models';
import {
  PERSONAL_GRID_STORAGE_KEY,
  loadPersistedPersonalGrid,
  savePersistedPersonalGrid,
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

test('createEmptyPersonalGridState returns six empty slots', () => {
  const state = createEmptyPersonalGridState();
  assert.equal(state.layout, 4);
  assert.equal(state.expandedSlotId, null);
  assert.equal(state.slots.length, 6);
  assert.equal(state.slots.every(slot => slot.symbol === null), true);
});

test('loadPersistedPersonalGrid returns defaults when storage is empty', () => {
  const storage = createStorageMock();
  const state = loadPersistedPersonalGrid(storage);
  assert.deepEqual(state, DEFAULT_PERSONAL_GRID_STATE);
});

test('savePersistedPersonalGrid stores serializable grid state', () => {
  const storage = createStorageMock();
  const state = {
    layout: 6 as const,
    expandedSlotId: 'slot-2',
    slots: createEmptyPersonalGridState().slots.map((slot, index) =>
      index === 1
        ? { ...slot, symbol: 'BTC/USDT', exchange: 'binance', marketType: 'spot' as const }
        : slot
    ),
  };

  savePersistedPersonalGrid(storage, state);
  const raw = storage.getItem(PERSONAL_GRID_STORAGE_KEY);

  assert.ok(raw);
  assert.deepEqual(JSON.parse(raw!), state);
});

test('loadPersistedPersonalGrid falls back to defaults for malformed data', () => {
  const storage = createStorageMock({
    [PERSONAL_GRID_STORAGE_KEY]: JSON.stringify({ bad: true }),
  });

  const state = loadPersistedPersonalGrid(storage);
  assert.deepEqual(state, DEFAULT_PERSONAL_GRID_STATE);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/personal-grid/persistence.test.ts
```

Expected: FAIL because the new files and exports do not exist yet.

- [ ] **Step 3: Write the model definitions**

Create `apps/web/src/lib/personal-grid/models.ts`:

```ts
export type PersonalGridLayout = 1 | 4 | 6;

export interface PersonalGridSlotConfig {
  id: string;
  symbol: string | null;
  exchange: string | null;
  marketType: 'spot' | 'futures' | null;
}

export interface PersonalGridState {
  layout: PersonalGridLayout;
  slots: PersonalGridSlotConfig[];
  expandedSlotId: string | null;
}

export function createEmptyPersonalGridState(): PersonalGridState {
  return {
    layout: 4,
    expandedSlotId: null,
    slots: Array.from({ length: 6 }, (_, index) => ({
      id: `slot-${index + 1}`,
      symbol: null,
      exchange: null,
      marketType: null,
    })),
  };
}

export const DEFAULT_PERSONAL_GRID_STATE = createEmptyPersonalGridState();
```

- [ ] **Step 4: Write persistence helpers**

Create `apps/web/src/lib/personal-grid/persistence.ts`:

```ts
import {
  DEFAULT_PERSONAL_GRID_STATE,
  type PersonalGridState,
} from './models';

export const PERSONAL_GRID_STORAGE_KEY = 'aionui.personal-grid.v1';

function isValidLayout(value: unknown): value is 1 | 4 | 6 {
  return value === 1 || value === 4 || value === 6;
}

function isValidState(value: unknown): value is PersonalGridState {
  if (!value || typeof value !== 'object') return false;
  const state = value as PersonalGridState;
  if (!isValidLayout(state.layout)) return false;
  if (!Array.isArray(state.slots) || state.slots.length !== 6) return false;
  return state.slots.every(slot =>
    slot &&
    typeof slot.id === 'string' &&
    (slot.symbol === null || typeof slot.symbol === 'string') &&
    (slot.exchange === null || typeof slot.exchange === 'string') &&
    (slot.marketType === null || slot.marketType === 'spot' || slot.marketType === 'futures')
  );
}

export function loadPersistedPersonalGrid(storage: Storage | null | undefined): PersonalGridState {
  if (!storage) return DEFAULT_PERSONAL_GRID_STATE;
  const raw = storage.getItem(PERSONAL_GRID_STORAGE_KEY);
  if (!raw) return DEFAULT_PERSONAL_GRID_STATE;

  try {
    const parsed = JSON.parse(raw);
    return isValidState(parsed) ? parsed : DEFAULT_PERSONAL_GRID_STATE;
  } catch {
    return DEFAULT_PERSONAL_GRID_STATE;
  }
}

export function savePersistedPersonalGrid(
  storage: Storage | null | undefined,
  state: PersonalGridState
): PersonalGridState {
  if (!storage) return state;
  storage.setItem(PERSONAL_GRID_STORAGE_KEY, JSON.stringify(state));
  return state;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
bun test apps/web/src/lib/personal-grid/persistence.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/personal-grid/models.ts apps/web/src/lib/personal-grid/persistence.ts apps/web/src/lib/personal-grid/persistence.test.ts
git commit -m "feat: add personal grid persistence primitives"
```

---

### Task 2: Add dedicated personal-grid store slice

**Files:**
- Modify: `apps/web/src/stores/index.ts`
- Reuse: `apps/web/src/lib/personal-grid/models.ts`
- Reuse: `apps/web/src/lib/personal-grid/persistence.ts`

- [ ] **Step 1: Add the failing store behavior test inline as a small temporary harness**

Add this temporary test block near the bottom of `apps/web/src/lib/personal-grid/persistence.test.ts` before implementation if no store test file is introduced:

```ts
test('personal grid state transitions produce expected slot updates', async () => {
  const { useUIStore } = await import('@/stores');

  useUIStore.getState().setPersonalGridLayout(6);
  useUIStore.getState().setPersonalGridSlot('slot-1', {
    symbol: 'BTC/USDT',
    exchange: 'binance',
    marketType: 'spot',
  });
  useUIStore.getState().expandPersonalGridSlot('slot-1');

  const state = useUIStore.getState();
  assert.equal(state.personalGrid.layout, 6);
  assert.equal(state.personalGrid.expandedSlotId, 'slot-1');
  assert.equal(state.personalGrid.slots[0].symbol, 'BTC/USDT');

  useUIStore.getState().clearPersonalGridSlot('slot-1');
  assert.equal(useUIStore.getState().personalGrid.slots[0].symbol, null);
});
```

If path alias imports are awkward in this test environment, replace this with a temporary Node script in the next step and remove it after verification.

- [ ] **Step 2: Implement personal-grid state and actions in the UI store**

Modify `apps/web/src/stores/index.ts`:

Add imports:

```ts
import {
  DEFAULT_PERSONAL_GRID_STATE,
  type PersonalGridLayout,
  type PersonalGridState,
} from '@/lib/personal-grid/models';
import {
  loadPersistedPersonalGrid,
  savePersistedPersonalGrid,
} from '@/lib/personal-grid/persistence';
```

Extend `UIStore`:

```ts
  personalGrid: PersonalGridState;
  setPersonalGridLayout: (layout: PersonalGridLayout) => void;
  setPersonalGridSlot: (
    slotId: string,
    next: { symbol: string; exchange: string; marketType: 'spot' | 'futures' }
  ) => void;
  clearPersonalGridSlot: (slotId: string) => void;
  expandPersonalGridSlot: (slotId: string) => void;
  collapsePersonalGridSlot: () => void;
```

Add a small helper above the store:

```ts
function getInitialPersonalGridState(): PersonalGridState {
  if (typeof window === 'undefined') return DEFAULT_PERSONAL_GRID_STATE;
  return loadPersistedPersonalGrid(window.localStorage);
}
```

Initialize state:

```ts
  personalGrid: getInitialPersonalGridState(),
```

Add actions:

```ts
  setPersonalGridLayout: (layout) =>
    set(state => {
      const personalGrid = { ...state.personalGrid, layout };
      if (typeof window !== 'undefined') {
        savePersistedPersonalGrid(window.localStorage, personalGrid);
      }
      return { personalGrid };
    }),

  setPersonalGridSlot: (slotId, next) =>
    set(state => {
      const slots = state.personalGrid.slots.map(slot =>
        slot.id === slotId ? { ...slot, ...next } : slot
      );
      const personalGrid = { ...state.personalGrid, slots };
      if (typeof window !== 'undefined') {
        savePersistedPersonalGrid(window.localStorage, personalGrid);
      }
      return { personalGrid };
    }),

  clearPersonalGridSlot: (slotId) =>
    set(state => {
      const slots = state.personalGrid.slots.map(slot =>
        slot.id === slotId
          ? { ...slot, symbol: null, exchange: null, marketType: null }
          : slot
      );
      const personalGrid = {
        ...state.personalGrid,
        slots,
        expandedSlotId: state.personalGrid.expandedSlotId === slotId ? null : state.personalGrid.expandedSlotId,
      };
      if (typeof window !== 'undefined') {
        savePersistedPersonalGrid(window.localStorage, personalGrid);
      }
      return { personalGrid };
    }),

  expandPersonalGridSlot: (slotId) =>
    set(state => {
      const personalGrid = { ...state.personalGrid, expandedSlotId: slotId };
      if (typeof window !== 'undefined') {
        savePersistedPersonalGrid(window.localStorage, personalGrid);
      }
      return { personalGrid };
    }),

  collapsePersonalGridSlot: () =>
    set(state => {
      const personalGrid = { ...state.personalGrid, expandedSlotId: null };
      if (typeof window !== 'undefined') {
        savePersistedPersonalGrid(window.localStorage, personalGrid);
      }
      return { personalGrid };
    }),
```

- [ ] **Step 3: Run the relevant verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/index.ts apps/web/src/lib/personal-grid/models.ts apps/web/src/lib/personal-grid/persistence.ts apps/web/src/lib/personal-grid/persistence.test.ts
git commit -m "feat: add personal grid state"
```

---

### Task 3: Build the chart picker modal

**Files:**
- Create: `apps/web/src/components/grid/chart-picker-modal.tsx`
- Modify: `apps/web/src/stores/index.ts` (only if selector helpers are needed)

- [ ] **Step 1: Write the minimal component contract test in code comments or temporary harness**

Use this expected prop shape as the contract:

```ts
type ChartPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    symbol: string;
    exchange: string;
    marketType: 'spot' | 'futures';
  }) => void;
  initialSelection?: {
    symbol: string | null;
    exchange: string | null;
    marketType: 'spot' | 'futures' | null;
  };
};
```

- [ ] **Step 2: Implement the picker modal**

Create `apps/web/src/components/grid/chart-picker-modal.tsx`:

```tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, BarChart2, Layers } from 'lucide-react';
import { useMarketStore } from '@/stores';

interface ChartPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    symbol: string;
    exchange: string;
    marketType: 'spot' | 'futures';
  }) => void;
  initialSelection?: {
    symbol: string | null;
    exchange: string | null;
    marketType: 'spot' | 'futures' | null;
  };
}

export function ChartPickerModal({
  open,
  onClose,
  onConfirm,
  initialSelection,
}: ChartPickerModalProps) {
  const tickers = useMarketStore(state => state.getTickersArray());
  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState(initialSelection?.exchange ?? selectedExchange);
  const [marketType, setMarketType] = useState<'spot' | 'futures'>(initialSelection?.marketType ?? 'spot');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(initialSelection?.symbol ?? null);

  useEffect(() => {
    if (!open) return;
    setExchange(initialSelection?.exchange ?? selectedExchange);
    setMarketType(initialSelection?.marketType ?? 'spot');
    setSelectedSymbol(initialSelection?.symbol ?? null);
    setQuery('');
  }, [open, initialSelection, selectedExchange]);

  const symbols = useMemo(() => {
    const items = tickers
      .filter(t => t.exchange === exchange && t.marketType === marketType)
      .map(t => t.symbol);
    return Array.from(new Set(items))
      .filter(symbol => symbol.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 30);
  }, [tickers, exchange, marketType, query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xl glass-card border border-border overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold text-text-primary">Add Chart</div>
                <div className="text-xs text-text-muted">Choose a symbol, exchange, and market type.</div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 bg-bg-primary/40 rounded-xl border border-border px-3 py-2">
                <Search className="w-4 h-4 text-text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search symbol"
                  className="bg-transparent outline-none w-full text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={exchange}
                  onChange={(event) => setExchange(event.target.value)}
                  className="bg-bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
                >
                  {['binance', 'bybit', 'okx', 'kucoin', 'bitget', 'gate', 'mexc', 'hyperliquid', 'coinbase'].map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>

                <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
                  <button
                    onClick={() => setMarketType('spot')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${marketType === 'spot' ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Spot</span>
                  </button>
                  <button
                    onClick={() => setMarketType('futures')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${marketType === 'futures' ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Futures</span>
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-auto space-y-2 pr-1">
                {symbols.map(symbol => (
                  <button
                    key={symbol}
                    onClick={() => setSelectedSymbol(symbol)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${selectedSymbol === symbol ? 'border-accent/40 bg-accent/10 text-text-primary' : 'border-border bg-bg-primary/30 text-text-secondary hover:bg-surface-hover'}`}
                  >
                    <div className="text-sm font-medium">{symbol}</div>
                    <div className="text-[11px] text-text-muted uppercase tracking-wide">{exchange} · {marketType}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={onClose} className="px-3 py-2 text-sm rounded-xl text-text-muted hover:text-text-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={() => selectedSymbol && onConfirm({ symbol: selectedSymbol, exchange, marketType })}
                disabled={!selectedSymbol}
                className="px-4 py-2 text-sm rounded-xl bg-accent/15 text-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Chart
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/chart-picker-modal.tsx
git commit -m "feat: add personal grid chart picker"
```

---

### Task 4: Build slot UI and expanded behavior

**Files:**
- Create: `apps/web/src/components/grid/personal-grid-slot.tsx`
- Reuse: `apps/web/src/components/charts/chart-card.tsx`

- [ ] **Step 1: Implement the slot component**

Create `apps/web/src/components/grid/personal-grid-slot.tsx`:

```tsx
'use client';

import { Plus, Expand, Pencil, Trash2, Minimize2 } from 'lucide-react';
import { ChartCard } from '@/components/charts/chart-card';
import type { PersonalGridSlotConfig } from '@/lib/personal-grid/models';

interface PersonalGridSlotProps {
  slot: PersonalGridSlotConfig;
  index: number;
  expanded: boolean;
  onAdd: (slotId: string) => void;
  onReplace: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onExpand: (slotId: string) => void;
  onCollapse: () => void;
}

export function PersonalGridSlot({
  slot,
  index,
  expanded,
  onAdd,
  onReplace,
  onRemove,
  onExpand,
  onCollapse,
}: PersonalGridSlotProps) {
  const isEmpty = !slot.symbol || !slot.exchange || !slot.marketType;

  if (isEmpty) {
    return (
      <button
        onClick={() => onAdd(slot.id)}
        className="glass-card border border-dashed border-border-light rounded-2xl h-full min-h-[220px] flex flex-col items-center justify-center gap-3 text-text-muted hover:text-text-secondary hover:border-accent/30 transition-all"
      >
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Plus className="w-5 h-5 text-accent-light" />
        </div>
        <div className="text-sm font-medium">Add Chart</div>
        <div className="text-xs text-text-muted">Choose symbol, exchange, and market type</div>
      </button>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-bg-primary/70 backdrop-blur rounded-xl border border-border px-1 py-1">
        <button onClick={() => expanded ? onCollapse() : onExpand(slot.id)} className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
          {expanded ? <Minimize2 className="w-4 h-4 text-text-muted" /> : <Expand className="w-4 h-4 text-text-muted" />}
        </button>
        <button onClick={() => onReplace(slot.id)} className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
          <Pencil className="w-4 h-4 text-text-muted" />
        </button>
        <button onClick={() => onRemove(slot.id)} className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
          <Trash2 className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <ChartCard
        symbol={slot.symbol}
        exchange={slot.exchange}
        index={index}
        initialMarketType={slot.marketType}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/grid/personal-grid-slot.tsx
git commit -m "feat: add personal grid slot component"
```

---

### Task 5: Build the personal grid view and wire it into the Grid tab

**Files:**
- Create: `apps/web/src/components/grid/personal-grid-view.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Implement the personal grid view**

Create `apps/web/src/components/grid/personal-grid-view.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Square, Grid2x2, Grid3x3 } from 'lucide-react';
import { useUIStore } from '@/stores';
import { PersonalGridSlot } from './personal-grid-slot';
import { ChartPickerModal } from './chart-picker-modal';

const GRID_OPTIONS = [
  { size: 1 as const, label: '1', icon: Square },
  { size: 4 as const, label: '4', icon: Grid2x2 },
  { size: 6 as const, label: '6', icon: Grid3x3 },
];

export function PersonalGridView() {
  const {
    personalGrid,
    setPersonalGridLayout,
    setPersonalGridSlot,
    clearPersonalGridSlot,
    expandPersonalGridSlot,
    collapsePersonalGridSlot,
  } = useUIStore();
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);

  const visibleSlots = useMemo(() => personalGrid.slots.slice(0, personalGrid.layout), [personalGrid]);
  const expandedSlot = personalGrid.expandedSlotId
    ? personalGrid.slots.find(slot => slot.id === personalGrid.expandedSlotId) ?? null
    : null;
  const pickerSlot = pickerSlotId
    ? personalGrid.slots.find(slot => slot.id === pickerSlotId) ?? null
    : null;

  const gridClass = personalGrid.layout === 1
    ? 'grid-cols-1 grid-rows-1'
    : personalGrid.layout === 4
      ? 'grid-cols-2 grid-rows-2'
      : 'grid-cols-2 grid-rows-3 xl:grid-cols-3 xl:grid-rows-2';

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {GRID_OPTIONS.map(({ size, label, icon: Icon }) => (
            <button
              key={size}
              onClick={() => setPersonalGridLayout(size)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${personalGrid.layout === size ? 'bg-accent/15 text-accent-light shadow-glow-sm' : 'text-text-muted hover:text-text-secondary'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {expandedSlot ? (
          <div className="h-full">
            <PersonalGridSlot
              slot={expandedSlot}
              index={0}
              expanded
              onAdd={setPickerSlotId}
              onReplace={setPickerSlotId}
              onRemove={clearPersonalGridSlot}
              onExpand={expandPersonalGridSlot}
              onCollapse={collapsePersonalGridSlot}
            />
          </div>
        ) : (
          <div className={`h-full grid ${gridClass} gap-3 min-h-0`}>
            {visibleSlots.map((slot, index) => (
              <PersonalGridSlot
                key={slot.id}
                slot={slot}
                index={index}
                expanded={false}
                onAdd={setPickerSlotId}
                onReplace={setPickerSlotId}
                onRemove={clearPersonalGridSlot}
                onExpand={expandPersonalGridSlot}
                onCollapse={collapsePersonalGridSlot}
              />
            ))}
          </div>
        )}
      </div>

      <ChartPickerModal
        open={pickerSlotId !== null}
        onClose={() => setPickerSlotId(null)}
        onConfirm={(selection) => {
          if (!pickerSlotId) return;
          setPersonalGridSlot(pickerSlotId, selection);
          setPickerSlotId(null);
        }}
        initialSelection={pickerSlot ? {
          symbol: pickerSlot.symbol,
          exchange: pickerSlot.exchange,
          marketType: pickerSlot.marketType,
        } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire Grid view to use the personal grid**

Modify `apps/web/src/app/page.tsx` so the `grid` view renders:

```tsx
import { PersonalGridView } from '@/components/grid/personal-grid-view';
```

and in the view switch:

```tsx
{viewMode === 'grid' && <PersonalGridView />}
```

If the file currently renders `ChartGrid` there, replace only the `grid` branch and leave other views untouched.

- [ ] **Step 3: Run build verification**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/personal-grid-view.tsx apps/web/src/app/page.tsx
git commit -m "feat: add personal grid workspace view"
```

---

### Task 6: Polish interaction details and verify persistence end-to-end

**Files:**
- Modify: `apps/web/src/components/grid/personal-grid-view.tsx`
- Modify: `apps/web/src/components/grid/personal-grid-slot.tsx`
- Modify: `apps/web/src/components/grid/chart-picker-modal.tsx`
- Modify: `apps/web/src/components/terminal/header.tsx` (only if copy/tone needs adjustment)

- [ ] **Step 1: Add minimal empty-state and expanded-state polish**

Ensure these behaviors exist:

- empty slots look intentional, not broken
- expanded mode has a clear collapse action
- replacing an existing slot opens the picker with prior values preselected
- removing an expanded slot collapses back to grid automatically

If needed, refine the slot component with a small empty-state description and ensure `clearPersonalGridSlot` already resets `expandedSlotId`.

- [ ] **Step 2: Verify local persistence manually**

Run:

```bash
npm --workspace apps/web run dev
```

Manual checks:

- add charts into multiple slots
- refresh page
- verify layout and slots restore
- expand one chart
- collapse back
- change layout from `6` to `1` and back to `6`
- verify hidden slots remain configured
- replace one slot
- remove one slot

Expected: All state survives refresh and behaves as designed.

- [ ] **Step 3: Run production build one final time**

Run:

```bash
npm --workspace apps/web run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/personal-grid-view.tsx apps/web/src/components/grid/personal-grid-slot.tsx apps/web/src/components/grid/chart-picker-modal.tsx apps/web/src/components/terminal/header.tsx apps/web/src/stores/index.ts
git commit -m "feat: finalize personal grid interactions"
```

---

## Self-Review

### Spec coverage

Covered:

- local-first persistence
- one personal grid
- `1 / 4 / 6` layouts
- fixed six slots
- add / replace / remove
- expanded chart mode
- reuse of `ChartCard`
- future account-sync friendly state shape

Not included by design:

- multi-workspace management
- drag-and-drop
- server sync

### Placeholder scan

No `TODO`, `TBD`, or “implement later” placeholders remain in tasks. Each task references exact files and commands.

### Type consistency

Shared types are introduced once in `models.ts` and reused across persistence, store, picker, and slot/view components. The plan consistently uses:

- `PersonalGridLayout`
- `PersonalGridSlotConfig`
- `PersonalGridState`
- `expandedSlotId`

