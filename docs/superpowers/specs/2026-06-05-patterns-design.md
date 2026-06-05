# Patterns v1 Design

Date: 2026-06-05
Status: Proposed

## Goal

Add a new `Patterns` tab that automatically scans `Binance futures` on the backend, finds high-quality market structures, and presents them in a usable trading workflow:

- list detected setups on the left
- show a live chart with automatic pattern drawing on the right
- let the user monitor active structures without manually searching the market

The core value of the feature is not only detection, but accurate and readable rendering of the detected structure on a realtime chart.

## Product Scope

### In scope

- one new `Patterns` tab
- backend scanner for `Binance futures only`
- pattern detection on:
  - `5m`
  - `15m`
  - `1h`
- pattern types:
  - `Cascade`
  - `Trendline`
  - `Triangle`
- statuses:
  - `Forming`
  - `Confirmed`
  - `Finished`
- quality score `0-100`
- left-side searchable and filterable result list
- right-side live chart with automatic pattern drawing
- in-app toast for newly detected `Confirmed` patterns
- storage in `Postgres`
- infinite scroll in the list

### Out of scope

- multi-exchange scanning
- Telegram delivery
- sound alerts
- force-rescan from UI
- directional trade bias in UI
- target projection or breakout target zones
- manual pattern editing
- pattern alert creation from the tab
- full historical archive of all old patterns

## Product Principles

### Structure, not prediction

The feature should identify and show market structure, not claim where price must go next.

Because of that:

- the UI should not show `direction` as a promise
- the UI should not show target projections
- the chart should draw the detected structure only

### Quality over noise

The scanner should prefer fewer, cleaner structures over a noisy stream of weak detections.

This applies to both:

- `Confirmed` setups
- `Forming` setups

Weak, messy, or low-signal candidates should be suppressed rather than shown.

### Backend authority

Pattern detection must live on the backend.

The frontend is a consumer and viewer:

- it reads results
- filters them
- renders them
- opens them on a live chart

The user should be able to open the app at any time and immediately see current active patterns.

## Scanner Model

### Market universe

`Patterns v1` scans:

- all `Binance futures` pairs

This is intentionally exchange-limited for the first release to keep the feature focused and avoid duplicate-looking structures across venues.

### Scan cadence

The backend scanner should run on a timed loop:

- approximately every `1-2 minutes`

### Candle policy

Pattern detection should use only:

- `closed candles`

The current open candle must not be treated as a confirming structural fact.

This reduces false positives and unstable redraw behavior.

### History depth

Pattern detection should analyze a moderate recent window:

- `5m`: around `200-300` candles
- `15m`: around `200-300` candles
- `1h`: around `200-300` candles

This is enough for relevant structures without turning the scanner into a heavy deep-history engine.

## Pattern Model

### Pattern types

The first implementation supports:

- `Cascade`
- `Trendline`
- `Triangle`

The system should be designed so future pattern types can be added without reworking the whole tab.

### Status model

Expose only these user-facing statuses:

- `Forming`
- `Confirmed`
- `Finished`

Internally, the backend may distinguish more detailed end states such as invalidated or played out, but the frontend should keep the status language simple.

### Quality model

The feature should use `quality`, not `confidence`.

`Quality` means how cleanly the detected structure matches scanner rules. It is not a probability of market success.

The score should be represented as:

- numeric `0-100`

It should be based on structure quality signals such as:

- cleanliness of pivot geometry
- touch quality
- symmetry or consistency
- structural maturity
- noise suppression

The UI must avoid implying that this is a trade recommendation.

## Pattern Lifecycle

### Active pattern life

Patterns remain visible while they are still structurally relevant.

### Final state retention

When a pattern becomes finished, it should:

- switch to `Finished`
- remain visible for `15 minutes`
- then disappear from the active results set

This gives the user time to notice what happened without turning the tab into a long-term archive.

### No full history in v1

The first release stores:

- active patterns
- recently finished patterns

It does not aim to be a full historical pattern analytics system yet.

## Deduplication Rules

The scanner may show multiple patterns on the same symbol and timeframe only if they are meaningfully different structures.

Examples:

- `Cascade` and `Triangle` on the same market can both appear
- two near-identical `Triangle` detections on the same region should not both appear

If multiple near-duplicate patterns of the same type are detected in the same zone:

- keep only the best one
- prefer the cleaner/higher-quality/currently relevant candidate

## Data Storage

### Persistence layer

Detected patterns should be stored in `Postgres`.

This is the right first-step persistence model because it supports:

- durability across backend restarts
- immediate availability when a user opens the app
- future expansion into analytics, alerts, and messaging

### Stored shape

The persisted model should be rich enough to support:

- symbol
- exchange
- market type
- timeframe
- pattern type
- status
- quality
- geometry data used for chart drawing
- timestamps such as detected/updated/expires

The geometry should be stored in a serializable structure so the frontend can render the pattern exactly.

## UI Layout

The `Patterns` tab should follow the existing terminal-style language of the app.

### Primary layout

Use a split view:

- left: list workspace
- right: chart workspace

### Left side

Contains:

- search by symbol
- basic filters
- result count
- pattern list with infinite scroll

### Right side

Contains:

- compact details block for the selected pattern
- full live chart with automatic pattern drawing
- optional `Open in Terminal` action

This must feel like part of the existing product, not a visually separate module.

## Left List Design

### Row model

One row equals one concrete detected setup.

If the same symbol has multiple different structures, they may appear as separate rows.

### Row fields

Each row should show:

- `symbol`
- `pattern`
- `timeframe`
- `status`
- `quality`
- `last updated`

### Color semantics

Pattern types should have stable colors:

- one color for `Cascade`
- one color for `Trendline`
- one color for `Triangle`

These colors are identifiers for pattern type, not trade direction.

The same color mapping should also appear in chart drawing so the list and chart stay visually linked.

### Sorting

Default sort order:

1. `Confirmed` before `Forming`
2. within the same status, higher `quality`
3. then freshness by last update

### Filters

Basic first-release filters:

- `pattern type`
- `timeframe`
- `status`

### Search

Add a symbol search field for quickly finding setups in long result lists.

### Infinite scroll

The list should use infinite scroll.

Behavior:

- initial page size: `30`
- additional pages load as the user scrolls

The backend still owns the full sorted current result set; the frontend consumes it in pages.

### Empty state

If no patterns are currently available, show a clear empty state such as:

- `Scanning market...`

This is better than an unexplained empty list.

## Right Chart Experience

### Chart type

The right side should use a full live chart, not a simplified viewer.

The user should be able to watch the structure in realtime just like anywhere else in the app.

### Auto-selection behavior

When the user clicks a row:

- open the correct symbol
- switch to the pattern timeframe automatically
- render the stored structure geometry immediately

### Auto-focus behavior

When a pattern is opened:

- the chart should fit the full structure
- include a small context margin around it

The user must immediately see the full detected setup without manual zooming.

### Manual interaction after open

The user may still interact with the chart manually after opening a pattern.

Examples:

- change timeframe
- pan
- zoom
- inspect the chart normally

But when the user clicks a different pattern row:

- the chart resynchronizes to the newly selected pattern

### Pattern drawing

The chart should draw only the structure itself.

Do not add:

- breakout target projections
- directional arrows
- long/short messaging
- prediction-style overlays

The value is structural clarity, not overclaiming future price action.

## Pattern Details Block

Above the chart, render a compact details block for the selected pattern.

Show:

- `symbol`
- `pattern`
- `timeframe`
- `status`
- `quality`
- `last updated`

This gives context without cluttering the chart itself.

## Notifications

### Notification channel

`Patterns v1` should support only:

- in-app visual toast notifications

No sound and no Telegram in the first release.

### Trigger condition

Show a toast only when:

- a brand-new `Confirmed` pattern appears

Do not notify for:

- `Forming`
- quality changes
- regular updates to an already known pattern

This keeps the feature useful without becoming noisy.

## Refresh Model

### Backend

Scanner refresh:

- every `1-2 minutes`

### Frontend

The frontend should poll the backend gently:

- around every `30-60 seconds`

Also allow:

- manual `Refresh UI`

Important:

- manual refresh only reloads current backend results
- it does not force a rescan

## State Persistence in the Frontend

Persist locally:

- last selected pattern
- current search value
- active filters

Behavior:

- on reload, try to restore the same selected pattern
- if that pattern no longer exists, open the best current result automatically
- if no results exist, show empty state

## Open in Terminal

The selected pattern should expose an `Open in Terminal` action.

This lets the user move a discovered setup into the main working flow without manually rebuilding the chart state.

## Technical Architecture

### Backend responsibilities

- fetch candle data for all supported Binance futures pairs and timeframes
- run pattern detectors
- deduplicate structurally overlapping results
- assign status and quality
- persist current results in Postgres
- expire finished patterns after `15 minutes`
- expose query endpoints for list data and selected pattern details

### Frontend responsibilities

- fetch list data
- apply local search/filter state
- render paged list
- maintain selected pattern state
- open the selected pattern on a live chart
- draw the provided geometry
- surface in-app notifications for newly confirmed items

## Risks

### False precision

If the UI implies prediction rather than structure, users may treat the tool as a signal engine promising direction.

Mitigation:

- no direction field in UI
- no target projection
- quality instead of confidence
- structure-only chart drawing

### Noise explosion

Scanning all Binance futures pairs across 3 timeframes can easily generate too many weak candidates.

Mitigation:

- strict detector thresholds
- deduplication
- quality-first selection
- `Forming` shown only when sufficiently clean

### Geometry drift

If backend geometry and frontend rendering do not align, the chart loses trust immediately.

Mitigation:

- persist exact geometry points
- keep chart drawing deterministic
- test each pattern type visually on live charts

### Scanner load

Scanning all Binance futures pairs repeatedly can become expensive.

Mitigation:

- bounded candle windows
- fixed timeframe set
- periodic scanner cadence instead of realtime scanning
- database storage of current state instead of recomputing everything on page open

## Success Criteria

The feature is successful when:

- the user opens `Patterns` and immediately sees current active Binance futures setups
- the list is searchable, filterable, and readable
- the chart opens the exact symbol and timeframe of the selected result
- the detected structure is drawn clearly and accurately
- newly confirmed patterns can surface inside the app without spam
- the tab feels native to the rest of the terminal
- the system remains stable and performant enough to run continuously on the backend
