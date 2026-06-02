# Chart Drawing Engine Design

Date: 2026-06-02  
Status: Approved (ready for implementation planning)

## 1. Goal

Add a production-grade drawing system for charts with TradingView-like core capabilities, adapted to the current app style, with strong performance constraints.

Required outcomes:
- Horizontal levels, signal levels, trendlines, vertical lines, rectangles/zones, ruler.
- Global hide/show for drawings.
- Full editing in grid widgets and expanded modal chart.
- Drawings persist across refresh/relogin and are removed only by explicit user action.
- Drawings are visible across all timeframes.
- Drawings are synced across browser tabs/windows for the same app session.
- Signal level behavior: one-shot trigger + manual reset.
- Notification flow works, including in-app popup when user is on another tab.

## 2. Scope

In scope:
- New drawing engine and overlay architecture (no legacy restore).
- Store and persistence model.
- Cross-tab synchronization.
- Signal trigger service and notification integration.
- Responsive behavior (desktop/tablet/mobile).
- Performance safeguards and tests.

Out of scope (this iteration):
- Backend storage (server-side drawing sync between different devices/accounts).
- Advanced tools (fib retracement, brush/freehand, long/short position tool).
- Collaborative multi-user real-time drawing editing.

## 3. Context and Constraints

- Current chart stack is Lightweight Charts in `apps/web/src/components/charts/chart-card.tsx`.
- There is a previously reverted drawing implementation; this design intentionally avoids restore/reuse as main path.
- System must remain lightweight under many concurrent users and many open tabs.
- UI style must remain consistent with existing app tokens/classes (`glass-panel`, accent palette, compact control styling).

## 4. Product Requirements (Confirmed)

1. Drawing visibility and ownership:
- Binding key: `exchange + marketType + symbol`.
- No timeframe binding; drawings are shown on all TF for the instrument.

2. Editing model:
- Full create/edit/delete both in grid cards and in expanded modal chart.

3. Persistence:
- Survives page reload, relogin, tab close/open.
- Deletion only by user action.

4. Signal levels:
- Trigger once when crossed.
- Persist triggered state.
- Allow manual reset to arm again.

5. Alerts/notifications:
- Bell button should open working in-app alert modal/history.
- Triggered signal from another tab must appear in current tab as in-app alert (toast + badge count).

## 5. Architecture

### 5.1 Modules

1. `DrawingStore` (zustand)
- Normalized entity store by instrument key.
- Selection state, active tool, visibility flags.
- Action API: create, update geometry, move, resize, delete, clear instrument, hide/show, reset signal.

2. `DrawingPersistenceAdapter`
- Local storage key: `aionui_drawings_v1`.
- Versioned schema with migration hook for future format upgrades.
- Incremental writes (changed entities only).

3. `DrawingSyncBus`
- Primary: `BroadcastChannel('aionui-drawings')`.
- Fallback: `window.storage` event.
- Emits compact operation events (`create/update/delete/reset/visibility`), not full snapshots.

4. `DrawingEngine` (pure TS, no React)
- Coordinate transforms `time/price <-> x/y`.
- Hit testing, selection, drag, resize handles.
- Shape projection for rendering.
- Pointer abstraction for mouse/touch/pen.

5. `DrawingOverlay` (React)
- Visual layer above chart container.
- Receives projected primitives from engine.
- Dispatches pointer events to engine/store.
- Renders handles and active previews.

6. `SignalService`
- Monitors price feed crossings for armed signal levels.
- Applies one-shot trigger state.
- Supports explicit reset action.
- Publishes alert events to alert stores/UI.

### 5.2 Data Model

Base:
- `id`, `kind`, `instrumentKey`, `exchange`, `marketType`, `symbol`
- `visible`, `locked`, `zIndex`, `createdAt`, `updatedAt`
- `style`: `color`, `lineWidth`, `lineStyle`, `fillOpacity`

Geometry by kind:
- `horizontal_line`: `price`
- `signal_level`: `price`, `triggered`, `triggeredAt`, `armed`
- `trendline`: `p1{time,price}`, `p2{time,price}`
- `vertical_line`: `time`
- `rectangle`: `p1{time,price}`, `p2{time,price}`
- `ruler`: `p1{time,price}`, `p2{time,price}`, transient metrics

## 6. UX and Responsive Behavior

### 6.1 Toolbar

- Must match application style (same visual language/tokens).
- Contains: cursor, horizontal line, signal level, trendline, vertical line, rectangle, ruler, hide/show, delete selected, clear instrument.
- Keyboard shortcuts for desktop; touch-first interactions for mobile.

### 6.2 Layout Adaptation

- Desktop: vertical left toolbar + precise handles.
- Tablet: compact floating toolbar, larger handle radius.
- Mobile: bottom horizontal toolbar, larger hit zones, simplified labels, non-overlapping controls.

### 6.3 Grid Widget Editing

- Full editing available in grid cards and modal.
- When card is small:
- Use reduced visual noise (fewer labels/secondary hints).
- Keep full interaction with adaptive handle density.

## 7. Alerts and Notification Flow

1. Bell button fix:
- Mount `AlertModal` in page tree so `toggleAlerts` opens actual UI.

2. Signal trigger event:
- `SignalService` creates alert payload for in-app stores.
- `AlertToast` shows popup if alert panel is closed.
- `unreadAlertCount` increments consistently.

3. Cross-tab notification:
- Trigger in tab A broadcasts alert event.
- Tab B receives event and shows in-app toast/badge (subject to local config).

4. Browser notification:
- Keep optional browser notifications under existing alert settings.

## 8. Performance Design

### 8.1 Render Strategy

- Overlay redraws via `requestAnimationFrame`.
- No full redraw on every market tick if drawing state unchanged.
- Partial invalidation: redraw only changed shapes/active interaction.

### 8.2 State and Memory

- Normalized maps to avoid O(n) scans on every pointer move.
- Per-instrument indexing for quick retrieval.
- Optional cap warnings for excessive drawing count per instrument.

### 8.3 Interaction Cost Control

- Hit-test only visible shapes within viewport bounds.
- Spatial prefilter (bounding boxes) before fine geometry checks.
- Throttle pointer move processing on low-end/mobile devices when needed.

### 8.4 Cross-tab Sync Cost Control

- Operation-based messages (diffs), not full state broadcast.
- Debounce burst updates during drag/resize.
- Ignore self-origin echoes.

### 8.5 Persistence Cost Control

- Lazy load once on app init.
- Batched writes with short debounce.
- Fail-safe recovery on malformed storage payload.

## 9. Error Handling and Reliability

- Storage read parse failure -> recover with empty state + soft warning log.
- Migration mismatch -> fallback migration path or clear incompatible payload with backup key.
- Broadcast channel unavailable -> storage-event fallback.
- Chart remount/resize -> engine reproject without losing model state.
- Symbol switch -> detach old instrument projection, keep persisted entities intact.

## 10. Testing Strategy

1. Unit tests:
- `DrawingEngine` geometry projection, hit-test, drag/resize math.
- `SignalService` crossing logic, one-shot behavior, reset behavior.
- Persistence migration/load/save behavior.

2. Integration tests:
- Create/edit/delete in grid and modal.
- Hide/show and per-shape visibility.
- Cross-tab sync behavior with simulated channel events.

3. Smoke/e2e:
- Draw -> refresh -> remains.
- Draw in tab A -> visible in tab B.
- Trigger signal in tab A -> alert appears in tab B.
- Mobile viewport interaction sanity checks.

## 11. Delivery Plan

Phase 1: Core
- Add data model, store, persistence adapter, sync bus skeleton.

Phase 2: Engine + Overlay
- Implement geometry engine and overlay rendering/event loop.
- Add full toolset and editing interactions.

Phase 3: Signals + Alerts
- Integrate signal monitoring and one-shot+reset flow.
- Wire Bell modal and cross-tab in-app notifications.

Phase 4: Performance + QA
- Profile pointer/paint/update paths.
- Apply throttling/invalidation optimizations.
- Finalize tests and responsive polish.

## 12. Acceptance Criteria

- All requested drawing tools are available and editable in grid + modal.
- Drawings persist across reload/relogin and remain until user deletes.
- Drawings are visible on all timeframes for same `exchange+marketType+symbol`.
- Hide/show works globally and per-object visibility is respected.
- Signal level triggers once, can be manually reset, and retriggers correctly after reset.
- Bell button opens working modal with signal alerts.
- Cross-tab in-app notifications work for signal triggers.
- No major frame drops in normal usage; overlay operations remain responsive on mobile and desktop.
