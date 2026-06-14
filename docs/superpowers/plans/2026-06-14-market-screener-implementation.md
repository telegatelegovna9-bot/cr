# Market Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `writing-plans` output as the execution source, then implement sequentially with short verification only. Avoid long-running tests. Prefer focused `tsc` and targeted specs.

**Goal:** Add a new shared `Market Screener` as the main content of the existing screener page while keeping the current `Signals Feed` as a compact secondary block. The system must compute once on the backend, remain independent of user count, and preserve current application style and runtime performance.

**Architecture:** Introduce a dedicated backend `screener` module with a bounded universe, rolling metrics store, and shared screener snapshots. Rework the frontend screener page into a blended layout that shows primary screener data plus compact signal feed and supports `Open Chart` actions from both.

**Tech Stack:** NestJS, TypeScript, existing market module and exchange connectors, shared in-memory metrics storage, Next.js React frontend, existing market/UI stores.

---

### Task 1: Create screener backend module and API skeleton

**Files:**
- Create: `apps/api/src/modules/screener/screener.module.ts`
- Create: `apps/api/src/modules/screener/screener.types.ts`
- Create: `apps/api/src/modules/screener/screener.service.ts`
- Create: `apps/api/src/modules/screener/screener.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Add core screener types:
  - `ScreenerRow`
  - `ScreenerSummary`
  - `ScreenerHealth`
  - `ScreenerState`
- [ ] Add controller endpoints:
  - `GET /screener`
  - `GET /screener/summary`
  - `GET /screener/health`
- [ ] Wire the module into `app.module.ts`
- [ ] Verify with:
  - `npx tsc -p apps/api/tsconfig.json --noEmit`

### Task 2: Add bounded universe config and rolling metrics store

**Files:**
- Create: `apps/api/src/modules/screener/screener.config.ts`
- Create: `apps/api/src/modules/screener/screener.store.ts`
- Create: `apps/api/src/modules/screener/screener.store.spec.ts`

- [ ] Define bounded screener universe:
  - primary futures universe
  - optional secondary spot universe
  - conservative default size such as `50-100` symbols
- [ ] Add rolling metrics storage for:
  - price windows
  - volume windows
  - OI snapshots
  - optional liquidation totals
- [ ] Ensure store updates incrementally and prunes by interval, not per-user request
- [ ] Verify with:
  - targeted store spec
  - `npx tsc -p apps/api/tsconfig.json --noEmit`

### Task 3: Build screener ingest service using shared sources

**Files:**
- Create: `apps/api/src/modules/screener/screener.ingest.ts`
- Modify: `apps/api/src/modules/screener/screener.module.ts`
- Modify: existing market/exchange integration files only where needed

- [ ] Add a shared screener ingest service that does not reuse chart subscriptions
- [ ] Source price and volume from existing market streams where cheap and isolated
- [ ] Add scheduled/background OI fetch path for supported exchanges
- [ ] Keep source coupling explicit so screener ingestion cannot regress chart performance
- [ ] Add health timestamps per source
- [ ] Verify with:
  - `npx tsc -p apps/api/tsconfig.json --noEmit`
  - grep review for any accidental chart-coupled subscriptions

### Task 4: Implement first screener signal engine

**Files:**
- Create: `apps/api/src/modules/screener/screener.engine.ts`
- Create: `apps/api/src/modules/screener/screener.engine.spec.ts`
- Modify: `apps/api/src/modules/screener/screener.service.ts`

- [ ] Implement `Price Velocity`
  - `1m`, `5m`, `15m`
- [ ] Implement `Volume Spike`
  - current rolling volume vs recent baseline
- [ ] Implement `OI Delta`
  - current OI vs previous OI snapshot
- [ ] Implement initial `Composite Score`
- [ ] Generate state labels:
  - `Momentum`
  - `Breakout Watch`
  - `OI Build`
  - `OI Unwind`
  - `Volume Expansion`
- [ ] Verify with:
  - targeted engine spec
  - `npx tsc -p apps/api/tsconfig.json --noEmit`

### Task 5: Add frontend screener models and API client

**Files:**
- Create: `apps/web/src/lib/screener/models.ts`
- Create: `apps/web/src/lib/screener/api.ts`
- Modify: any existing shared fetch utilities if needed

- [ ] Add typed client models for screener rows, summary, and health
- [ ] Add fetchers for:
  - `fetchScreener()`
  - `fetchScreenerSummary()`
  - `fetchScreenerHealth()`
- [ ] Verify with:
  - `npx tsc -p apps/web/tsconfig.json --noEmit`

### Task 6: Refactor screener page into blended layout

**Files:**
- Modify: `apps/web/src/components/screener/screener-view.tsx`
- Create if needed: `apps/web/src/components/screener/screener-table.tsx`
- Create if needed: `apps/web/src/components/screener/screener-detail.tsx`
- Create if needed: `apps/web/src/components/screener/compact-signals-feed.tsx`

- [ ] Keep existing page route and visual identity
- [ ] Make `Market Screener` the primary visible block
- [ ] Move existing signals feed into a compact secondary block
- [ ] Preserve existing signal data access without deleting the signals system
- [ ] Show screener summary cards first
- [ ] Show screener rows with:
  - symbol
  - price changes
  - volume spike
  - OI change
  - score
  - state
- [ ] Verify with:
  - `npx tsc -p apps/web/tsconfig.json --noEmit`

### Task 7: Add Open Chart actions

**Files:**
- Modify: `apps/web/src/components/screener/screener-view.tsx`
- Modify: any helper components created in Task 6
- Reuse existing stores in `apps/web/src/stores/index.ts`

- [ ] Add `Open Chart` action to screener rows
- [ ] Add `Open Chart` action to compact signals feed rows
- [ ] On action:
  - switch to `terminal`
  - set selected symbol
  - set exchange where relevant
  - optionally set default timeframe
- [ ] Verify manually and with:
  - `npx tsc -p apps/web/tsconfig.json --noEmit`

### Task 8: Add screener health and stale-state UX

**Files:**
- Modify: `apps/api/src/modules/screener/screener.service.ts`
- Modify: `apps/web/src/components/screener/screener-view.tsx`

- [ ] Report last ingest freshness and source health
- [ ] Surface stale or unavailable OI gracefully
- [ ] Ensure UI does not present missing data as valid data
- [ ] Verify with:
  - `npx tsc -p apps/api/tsconfig.json --noEmit`
  - `npx tsc -p apps/web/tsconfig.json --noEmit`

### Task 9: Add optional v1.1 enrichment behind cheap gates

**Files:**
- Modify: `apps/api/src/modules/screener/screener.engine.ts`
- Modify: `apps/api/src/modules/screener/screener.types.ts`
- Modify: frontend screener presentation files

- [ ] Add `Taker Imbalance` if source integration is cheap enough
- [ ] Add `Liquidation Pressure` if it does not regress runtime cost
- [ ] Keep both behind strict thresholds so they improve quality instead of adding spam
- [ ] Verify with short targeted checks only

### Task 10: Final cleanup and verification

**Files:**
- Review only touched screener files plus compact signal feed integration

- [ ] Remove temporary placeholders and dead screener code
- [ ] Confirm no accidental coupling between screener ingest and chart subscriptions
- [ ] Confirm old `signals` system still works as compact block
- [ ] Confirm new layout stays in current app style
- [ ] Verify with:
  - `npx tsc -p apps/api/tsconfig.json --noEmit`
  - `npx tsc -p apps/web/tsconfig.json --noEmit`
  - targeted grep for screener/chart coupling

## Execution Notes

- Do not remove the current `signals` product from the page.
- Do not reintroduce excluded major assets into signal feed work during this screener track.
- Keep computations shared and backend-owned.
- If a metric source is too expensive or noisy, degrade gracefully instead of widening scope.
- Prefer small modules and explicit boundaries so future paid data integration remains possible without rewriting the page.
