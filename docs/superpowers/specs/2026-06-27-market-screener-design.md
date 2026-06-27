# Market Screener Design

Date: 2026-06-27
Branch: `fix/drawing-overlay-coordinate-system`

## Goal

Build a premium terminal-style market screener tab for the web app that:

- scans the full available market universe across supported exchanges;
- supports both `spot` and `futures`, with a hard split between them;
- lets users configure rich metric filters similar to the provided reference;
- updates results live without turning the system into a per-user compute engine;
- supports local user presets on day one;
- supports browser-side sound notifications with on/off control;
- remains scalable for large concurrent usage by sharing server-side computation.

This phase is for the core live screener experience. Full account-synced presets and server-side personal alert execution are explicitly deferred.

## Product Scope

The screener is a shared market scanner, not a custom server compute job per user.

Users can:

- switch between `Spot` and `Futures`;
- set metric ranges using `Min` and `Max`;
- choose per-metric timeframes where applicable;
- save and reuse local presets;
- toggle sound notifications for newly appearing matches;
- view a live result table;
- open a symbol into the chart flow.

The system does not yet need:

- cloud/user-account preset sync;
- arbitrary user-defined formulas;
- background server-side execution of unique alert rules per user;
- push/email/mobile notifications.

## UX Layout

The screener tab uses the same visual language as the current app: dark premium terminal styling, glass surfaces, compact dense controls, strong table readability, and no generic dashboard look.

### Top Filter Panel

A full-width premium filter panel sits at the top of the screener view.

Layout:

- 3 to 4 responsive columns on desktop;
- stacked compact cards on narrower widths;
- each metric rendered as its own compact filter block.

Each filter block contains:

- metric name;
- `Timeframe` selector when the metric is timeframe-based;
- `Min` input;
- `Max` input.

Initial metrics:

- `Change %`
- `Trades`
- `Turnover`
- `NATR %`
- `Spread %`
- `Funding %`
- `Volume Spike %`
- `Trades Spike %`
- `OI Change %`
- `OI`
- `Delta Volume %`
- `Delta Volume`
- `Price`

Global controls inside the top area:

- `Spot / Futures` mode switch;
- exchange toggles or multi-select;
- preset controls: `Preset name`, `Save`, `Update`, `Delete`, `Load`;
- `Sound On / Off`;
- `Reset filters`.

### Result Area

Below the filters sits the main screener table.

Above the table is a compact status row with:

- current mode (`Spot` or `Futures`);
- active exchange scope;
- match count;
- last update time;
- sound state;
- active preset name.

Table columns for initial release:

- `Symbol`
- `Exchange`
- `Market`
- `Price`
- `Change %`
- `Volume Spike %`
- `Trades Spike %`
- `OI Change %`
- `Funding %`
- `Spread %`
- `Turnover`
- `Updated`

Table behavior:

- dense terminal-style rows;
- sortable columns;
- subtle positive/negative color accents;
- brief row highlight for newly appearing matches;
- click row to open the symbol in the chart flow.

## Filter Semantics

The UI can expose many filters, but the backend must interpret them in a constrained and predictable way.

### Range Filters

Each metric uses inclusive `Min` / `Max` bounds.

Rules:

- empty `Min` means no lower bound;
- empty `Max` means no upper bound;
- both empty means filter disabled;
- invalid numeric input disables the specific bound until corrected.

### Timeframe Filters

Metrics that are timeframe-derived support explicit timeframe selection per metric.

Examples:

- `Change %` on `1m`;
- `Volume Spike %` on `5m`;
- `OI Change %` on `15m`.

Metrics that are inherently current-state values do not need a timeframe field:

- `Price`
- `Spread %`
- `Funding %` when sourced as a current exchange value
- `OI` if treated as current-state open interest

### Spot / Futures Split

The tab has a hard market mode switch:

- `Spot`
- `Futures`

Results never mix both modes in one table view.

This keeps comparisons clean and avoids mixing metrics with materially different meaning.

## Data Model

The screener must not calculate full custom logic per user.

The system instead has two layers:

1. Shared market feature computation
2. User-side filtering/preset application

### Shared Feature Layer

For each symbol/exchange/market combination, the server computes a normalized screener snapshot containing the metrics needed by the UI.

Example fields:

- symbol
- exchange
- marketType
- price
- priceChangePct by timeframe
- turnover by timeframe
- trades by timeframe
- volume spike by timeframe
- trades spike by timeframe
- NATR by timeframe
- spreadPct current
- fundingPct current
- openInterest current
- openInterestChangePct by timeframe
- deltaVolume absolute and pct by timeframe
- updatedAt

The exact internal storage shape can differ, but it must support fast filtering without recomputing indicators for each user request.

### Preset Model

Presets are local-first but sync-ready.

Preset shape should already be future-safe:

- `id`
- `name`
- `marketType`
- `exchanges`
- `soundEnabled`
- `filters`
- `createdAt`
- `updatedAt`

For now:

- store locally in browser persistence;
- load at startup of the screener tab;
- no server persistence required.

Later:

- the same schema can be saved to user accounts with minimal changes.

## Performance Model

This is the core architectural constraint.

### What Must Not Happen

Do not design the screener so that:

- each user causes fresh market-wide indicator recomputation;
- each preset becomes a separate server-side streaming job;
- raw firehose data is sent to every client;
- the frontend computes the full market feature set independently.

That architecture would not scale well to 1000 concurrent users.

### Required Architecture

The correct model is:

- server computes shared feature snapshots once per market stream;
- snapshots are updated on a bounded cadence;
- clients fetch or subscribe to already-computed screener rows;
- client-side preset filters decide what to display and when to play sound.

This means user concurrency mostly multiplies cheap read/filter/render work, not expensive market computations.

### Update Strategy

The screener should feel live, but it does not need tick-by-tick raw market rendering.

Recommended behavior:

- shared screener snapshot updates on a bounded cadence;
- frontend receives either periodic refreshes or a thin result stream;
- row updates are incremental where possible;
- only newly qualifying rows trigger sound.

The implementation plan can choose polling, websocket snapshots, or hybrid transport, but the shared-compute principle is mandatory.

## Sound Notification Behavior

Sound is local/browser-side in phase one.

Rules:

- sound is toggleable globally in the screener UI;
- sound state can be stored with a preset;
- sound only plays when a symbol newly enters the filtered result set;
- simple row reordering or metric drift inside an already-matching row must not replay sound;
- changing filters or presets should reset the local notification baseline to avoid a burst of false "new" sounds.

## Result Matching Rules

The screener result set is the intersection of:

- current market mode;
- selected exchanges;
- active metric bounds.

Rows are included only when all active filters pass.

A row is considered "newly matched" when:

- it was not in the previous filtered result set for the current client view;
- and it appears in the current filtered result set after fresh data is applied.

## Interaction Model

### Presets

Users can:

- create a preset from current filters;
- overwrite an existing preset;
- delete a preset;
- switch presets quickly.

Switching presets updates:

- all visible filter controls;
- market mode;
- exchange scope;
- sound toggle.

### Row Click

Clicking a row should route into the existing chart workflow for that symbol and market context.

Expected result:

- open chart modal or chart slot using current app conventions;
- preserve exchange and market type;
- avoid introducing a second chart navigation model.

## Error Handling

The screener should degrade cleanly if data is partial.

Rules:

- unavailable metrics display as empty or unset instead of corrupt numbers;
- filters against missing metrics exclude that row by default;
- API or stream interruptions show a stale-data indicator without clearing the whole table immediately;
- preset loading failures fall back to a safe default preset.

## Testing Requirements

Implementation should include:

- unit tests for filter evaluation logic;
- unit tests for preset serialization and deserialization;
- unit tests for "newly matched" sound-trigger logic;
- unit tests for server-side screener snapshot generation where feasible;
- build verification for the web workspace;
- at least one integration path proving row click opens the right chart context.

## Phasing

### Phase 1

- screener UI tab;
- top filter panel;
- live result table;
- spot and futures split;
- local presets;
- browser sound toggle;
- shared-compute architecture.

### Phase 2

- account sync for presets;
- richer table customization;
- saved screener views per user;
- optional server-backed alert execution.

### Explicit Non-Goals For Phase 1

- arbitrary formula builder;
- multi-device sync;
- personal always-on background alerts;
- push notifications.

## Acceptance Criteria

The feature is successful when:

- users can configure filters matching the provided reference style;
- the screener updates live and feels premium;
- presets are saved and restored locally;
- sound plays only for genuinely new matches;
- spot and futures are fully separated in the UI;
- the server architecture does not scale linearly in compute cost with each user's presets.
