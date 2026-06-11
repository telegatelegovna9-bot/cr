# WebSocket Reconnect And Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chart recovery after tab return and transient disconnects feel immediate while reducing backend churn and keeping the system scalable to 1000 concurrent users.

**Architecture:** Move from component-local reconnect behavior to a session-level subscription manager with reference counting, explicit lifecycle recovery, and server-side fanout that never unsubscribes upstream exchange streams until the last real consumer is gone. Prefer cache-first recovery and targeted snapshots over burst REST reloads. Add observability around reconnect latency and subscription churn so regressions are measurable.

**Tech Stack:** Next.js/React, Zustand, browser WebSocket API, NestJS WebSocket gateway, in-memory subscription registries, exchange connector layer, existing REST history endpoint, lightweight-charts.

---

## File Structure

- Modify: `apps/web/src/hooks/useWebSocket.ts`
  Responsibility: single client-side connection manager, lifecycle handling, reconnect strategy, subscription ref-counting, reconnect telemetry hooks.
- Modify: `apps/web/src/components/charts/chart-card.tsx`
  Responsibility: chart recovery policy, cache-first refresh, gap policy, view activation behavior.
- Modify: `apps/web/src/stores/index.ts`
  Responsibility: optional reconnect/recovery metrics state and stable snapshot storage hooks if kept in Zustand.
- Modify: `apps/api/src/modules/market/market.gateway.ts`
  Responsibility: client subscription registry, initial snapshot push on subscribe/resubscribe, safe cleanup rules.
- Modify: `apps/api/src/modules/market/market.service.ts`
  Responsibility: upstream exchange subscription reference counting per stream type, ticker/trade/candle/orderbook decoupling, snapshot helpers.
- Modify: `packages/exchange-connectors/src/manager.ts`
  Responsibility: connector-level subscribe/unsubscribe semantics and no-op safety during reconnect windows.
- Modify: `packages/exchange-connectors/src/base.ts`
  Responsibility: reconnect behavior, subscription persistence rules, connector recovery invariants.
- Modify as needed: `packages/exchange-connectors/src/binance.ts`, `bybit.ts`, `okx.ts`, `bitget.ts`, `mexc.ts`, `generic.ts`
  Responsibility: preserve intended subscriptions across reconnect and avoid duplicate exchange-side subscribe/unsubscribe calls.
- Create: `apps/web/src/hooks/useWebSocket.test.ts` or colocated tests if current setup prefers that pattern
  Responsibility: client reconnect/ref-count regression tests.
- Create: `apps/api/src/modules/market/market.gateway.spec.ts`
  Responsibility: gateway resubscribe/snapshot/ref-count tests.
- Create: `apps/api/src/modules/market/market.service.spec.ts`
  Responsibility: upstream subscription ownership tests.

### Task 1: Add Observability Before Behavior Changes

**Files:**
- Modify: `apps/web/src/hooks/useWebSocket.ts`
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Modify: `apps/api/src/modules/market/market.gateway.ts`
- Modify: `apps/api/src/modules/market/market.service.ts`

- [ ] **Step 1: Add client-side timestamps for recovery stages**

Record:
- socket close time
- reconnect scheduled time
- reconnect open time
- first post-reconnect ticker time
- first post-reconnect candle time
- chart refresh start/end time

Store them behind guarded debug logs or a lightweight dev-only metric object so production overhead is negligible.

- [ ] **Step 2: Add server-side churn counters**

Record:
- client subscribe count
- client unsubscribe count
- upstream subscribe count
- upstream unsubscribe count
- per-symbol active consumer count

Expose them only via logs or a debug endpoint, not on every message path.

- [ ] **Step 3: Verify baseline manually**

Reproduce:
1. Open terminal view with multiple charts.
2. Switch tab for 10-30 seconds.
3. Return and measure:
   - time to socket reopen
   - time to first live tick
   - time to first candle update
   - number of REST `/api/history` calls

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useWebSocket.ts apps/web/src/components/charts/chart-card.tsx apps/api/src/modules/market/market.gateway.ts apps/api/src/modules/market/market.service.ts
git commit -m "chore: add reconnect and subscription churn telemetry"
```

### Task 2: Fix Client Subscription Ownership

**Files:**
- Modify: `apps/web/src/hooks/useWebSocket.ts`
- Test: `apps/web/src/hooks/useWebSocket.test.ts`

- [ ] **Step 1: Write failing tests for duplicate consumer scenarios**

Cover:
- two charts subscribing to same candle stream
- one chart unsubscribing while the other remains mounted
- reconnect preserving one logical subscription with ref-count > 1
- orderbook subscription sharing

- [ ] **Step 2: Run tests to verify they fail**

Run the targeted hook test command used by the repo for frontend unit tests.

- [ ] **Step 3: Replace `Set<string>` with a ref-counted registry**

Required behavior:
- key: deterministic subscription identity
- value: `{ refCount, lastSentState, lastAckState }`
- send upstream subscribe only on transition `0 -> 1`
- send upstream unsubscribe only on transition `1 -> 0`
- on reconnect, replay only effective active subscriptions once

- [ ] **Step 4: Add lifecycle-triggered fast recovery**

Client connection manager should:
- attempt immediate reconnect on `visibilitychange -> visible` when socket is not open
- attempt immediate reconnect on `window.focus`
- attempt immediate reconnect on `online`
- avoid duplicate concurrent connect attempts
- cancel stale reconnect timers when immediate recovery wins

- [ ] **Step 5: Keep reconnect policy cheap**

Rules:
- no polling loop
- no per-chart reconnect logic
- one shared socket only
- bounded timer count

- [ ] **Step 6: Re-run tests and verify pass**

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useWebSocket.ts apps/web/src/hooks/useWebSocket.test.ts
git commit -m "fix: ref-count shared websocket subscriptions"
```

### Task 3: Make Chart Recovery Cache-First And Burst-Safe

**Files:**
- Modify: `apps/web/src/components/charts/chart-card.tsx`
- Modify if needed: `apps/web/src/components/charts/chart-history.ts`
- Test: existing chart history tests plus new recovery-specific tests

- [ ] **Step 1: Write failing tests for return-from-background behavior**

Cover:
- visible return with stale last candle but no large timeframe gap
- visible return with missing current bucket
- multiple charts returning at once without duplicate identical history fetches

- [ ] **Step 2: Replace per-chart naive recovery with deduplicated fetches**

Required behavior:
- reuse cached history immediately for rendering
- coalesce identical in-flight `/api/history` refreshes by `exchange:marketType:symbol:timeframe`
- allow one recovery fetch per stream at a time

- [ ] **Step 3: Relax the recovery trigger**

Do not wait only for `gap > 1.5 * timeframe`.

Use a cheap freshness rule:
- if socket was re-opened recently, do one targeted refresh for latest range
- if last candle bucket is older than current bucket, refresh immediately
- if last ticker timestamp is stale after visibility return, refresh immediately

- [ ] **Step 4: Avoid full history resets**

Recovery must:
- fetch latest slice only
- merge into local cache
- keep visible range stable
- avoid `setData` for full series unless merge actually changes data materially

- [ ] **Step 5: Verify reduced REST pressure**

Success criteria:
- returning to a page with N identical charts does not produce N identical refresh calls
- no refresh call if fresh live data resumes quickly

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/charts/chart-card.tsx apps/web/src/components/charts/chart-history.ts
git commit -m "perf: dedupe chart recovery and reduce refresh bursts"
```

### Task 4: Push Initial Snapshot On Subscribe/Resubscribe

**Files:**
- Modify: `apps/api/src/modules/market/market.gateway.ts`
- Modify: `apps/api/src/modules/market/market.service.ts`
- Test: `apps/api/src/modules/market/market.gateway.spec.ts`

- [ ] **Step 1: Write failing gateway tests**

Cover:
- candle subscribe receives latest candle snapshot immediately when available
- orderbook subscribe receives latest snapshot immediately when available
- reconnect/resubscribe does not wait for next exchange event to unfreeze chart

- [ ] **Step 2: Add snapshot helpers in MarketService**

Add read-only helpers such as:
- `getLatestTicker(exchange, symbol)`
- `getLatestCandle(exchange, symbol, timeframe)`
- `getLatestOrderBook(exchange, symbol)`

These must read existing caches only and never trigger outbound exchange calls on subscribe path.

- [ ] **Step 3: Send snapshots from gateway after subscribe ack**

Behavior:
- ticker subscription: send cached ticker if present
- candle subscription: send cached latest candle if present
- orderbook subscription: send cached orderbook if present

This must be O(1) map reads and one websocket send per active stream.

- [ ] **Step 4: Ensure reconnect replay stays idempotent**

No duplicate downstream messages should create duplicate bars or break orderbook state.

- [ ] **Step 5: Re-run tests and commit**

```bash
git add apps/api/src/modules/market/market.gateway.ts apps/api/src/modules/market/market.service.ts apps/api/src/modules/market/market.gateway.spec.ts
git commit -m "feat: send cached market snapshots on subscribe"
```

### Task 5: Decouple Upstream Exchange Stream Ownership

**Files:**
- Modify: `apps/api/src/modules/market/market.service.ts`
- Test: `apps/api/src/modules/market/market.service.spec.ts`

- [ ] **Step 1: Write failing service tests around ref-count collisions**

Cover:
- two candle subscribers on same symbol/timeframe
- candle + ticker consumer sharing same symbol
- candle timeframe A unsubscribing must not remove trades needed by timeframe B
- orderbook consumers share upstream stream safely

- [ ] **Step 2: Split reference counts by real upstream primitive**

Maintain separate registries for:
- ticker streams
- trade streams
- candle streams
- orderbook streams

Do not derive trade unsubscription from candle unsubscription blindly.

- [ ] **Step 3: Make unsubscribe transition-based only**

Only call connector `unsubscribe*` when the matching upstream primitive ref-count hits zero.

- [ ] **Step 4: Preserve warm upstream subscriptions across brief client disconnect storms**

Optional production optimization:
- add short server-side grace window before upstream unsubscribe on client disconnect
- cancel grace timer if the same stream regains consumers quickly

This reduces exchange churn during tab sleep/resume without adding steady-state load.

- [ ] **Step 5: Re-run tests and commit**

```bash
git add apps/api/src/modules/market/market.service.ts apps/api/src/modules/market/market.service.spec.ts
git commit -m "fix: decouple upstream market stream reference counts"
```

### Task 6: Make Connector Reconnect Preserve Intent

**Files:**
- Modify: `packages/exchange-connectors/src/base.ts`
- Modify as needed: `packages/exchange-connectors/src/binance.ts`, `bybit.ts`, `okx.ts`, `bitget.ts`, `mexc.ts`, `generic.ts`

- [ ] **Step 1: Write targeted regression tests where feasible**

If full connector tests are expensive, add focused unit coverage around subscription state containers and reconnect helpers.

- [ ] **Step 2: Stop clearing intended subscription state on raw socket close**

Rule:
- transient transport disconnect must not erase desired subscriptions
- only explicit unsubscribe or full connector teardown may remove desired subscriptions

- [ ] **Step 3: Rehydrate exchange subscriptions on connector reopen**

Per connector:
- replay desired spot/futures/business/public streams once
- avoid duplicate subscribe frames if connector already tracks active exchange subscriptions

- [ ] **Step 4: Review polling connectors carefully**

For REST-polled connectors in `generic.ts`:
- ensure intervals are not duplicated on reconnect
- ensure polling cadence stays bounded
- avoid per-client fanout multiplying polling rate

- [ ] **Step 5: Commit**

```bash
git add packages/exchange-connectors/src/base.ts packages/exchange-connectors/src/binance.ts packages/exchange-connectors/src/bybit.ts packages/exchange-connectors/src/okx.ts packages/exchange-connectors/src/bitget.ts packages/exchange-connectors/src/mexc.ts packages/exchange-connectors/src/generic.ts
git commit -m "fix: preserve exchange subscriptions across reconnects"
```

### Task 7: Add Scalable Recovery Guards For 1000 Users

**Files:**
- Modify: `apps/api/src/modules/market/market.gateway.ts`
- Modify: `apps/api/src/modules/market/market.service.ts`
- Modify: `apps/web/src/hooks/useWebSocket.ts`
- Modify: `apps/web/src/components/charts/chart-card.tsx`

- [ ] **Step 1: Add request coalescing and bounded snapshot sends**

Rules:
- one shared market snapshot per active symbol stream in memory
- no subscribe path DB queries
- no reconnect path full-history replay

- [ ] **Step 2: Add churn protections**

Examples:
- debounce client-side rapid subscribe/unsubscribe sequences caused by remounts
- server-side grace period for disconnect cleanup
- ignore duplicate subscribe frames for already-owned streams

- [ ] **Step 3: Validate the 1000-user shape**

Expected architecture outcome:
- backend exchange subscriptions scale roughly with unique market streams, not user count
- websocket fanout scales with connected clients, but upstream exchange traffic stays bounded
- REST refresh traffic stays tied to unique recovery streams, not chart instance count

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/market/market.gateway.ts apps/api/src/modules/market/market.service.ts apps/web/src/hooks/useWebSocket.ts apps/web/src/components/charts/chart-card.tsx
git commit -m "perf: harden market recovery for high concurrency"
```

### Task 8: Verification And Rollout

**Files:**
- Modify if needed: docs/runbooks or internal notes for reconnect diagnostics

- [ ] **Step 1: Run focused test suites**

Run the relevant frontend, API, and connector tests for the touched areas.

- [ ] **Step 2: Manual recovery verification**

Scenarios:
1. Single chart, short tab switch.
2. Multi-chart terminal view, short tab switch.
3. Modal open + base grid same symbol.
4. Same symbol across multiple timeframes.
5. Heatmap enabled and disabled.
6. Temporary offline/online transition.

- [ ] **Step 3: Compare telemetry against baseline**

Target outcomes:
- reconnect perceived latency materially lower
- fewer `/api/history` recovery calls
- fewer upstream exchange subscribe/unsubscribe operations
- no chart freeze waiting for next candle

- [ ] **Step 4: Request code review**

Review focus:
- ref-count correctness
- reconnect race conditions
- duplicate replay safety
- production load shape

- [ ] **Step 5: Final commit if follow-up fixes were needed**

```bash
git add .
git commit -m "chore: finalize websocket recovery hardening"
```

## Expected Architecture Outcomes

- Recovery after tab return is driven by one socket manager, not by each chart independently.
- Exchange-side subscriptions scale with unique `(exchange, marketType, symbol, timeframe/channel)` streams rather than number of viewers.
- Cached snapshots make charts visibly recover immediately after resubscribe without waiting for the next live event.
- REST history refresh becomes a sparse reconciliation path, not the primary recovery mechanism.
- Temporary disconnect storms no longer churn upstream exchange subscriptions aggressively.

## Priority Order

1. Client subscription ref-counting and immediate lifecycle reconnect
2. Gateway cached snapshots on subscribe/resubscribe
3. MarketService upstream ref-count separation
4. Chart recovery dedupe and burst control
5. Connector subscription persistence across reconnect
6. Telemetry-based validation and hardening

## Risks To Watch

- Duplicate replay causing double candle updates
- Over-aggressive refresh logic increasing REST load instead of reducing it
- Grace-period cleanup leaking unused upstream subscriptions too long
- Connector-specific spot/futures side channels drifting out of sync

## Success Metrics

- Median time from tab visible to first live ticker under 500ms on a healthy network
- Median time from tab visible to chart motion under 1s without full history reset
- Recovery-triggered `/api/history` requests reduced materially in multi-chart views
- Upstream exchange subscribe/unsubscribe operations tied to unique stream count, not viewer count
