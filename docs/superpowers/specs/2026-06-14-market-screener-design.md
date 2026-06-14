# Market Screener Design

## Goal

Add a real market screener to the existing `Screener` page without removing the current `market signals` product. The page should become a blended screen:

- `Market Screener` as the primary product surface;
- `Signals Feed` as a compact secondary block;
- `Open Chart` actions from both sections for manual analysis.

The new screener must run as a shared backend service, compute once for all users, avoid per-user heavy work, and stay consistent with the app's current visual style.

## Problem

The current page is centered around `market signals`, which are useful as a large-trade monitor but do not satisfy the intended "real screener" use case. Users need a page that helps spot meaningful market changes such as:

- rapid price expansion;
- unusual volume spikes;
- open interest build-up or unwind;
- aggressive taker imbalance;
- liquidation bursts;
- compression followed by expansion.

The existing page does not surface these conditions as first-class signals, and it does not act as a true market screener.

## Product Direction

The page should become a two-layer workspace:

1. `Market Screener`
   The main table and summary system. It answers:
   - what is moving unusually fast;
   - where volume is expanding;
   - where futures positioning is changing;
   - where there may be squeeze or liquidation pressure.

2. `Signals Feed`
   The existing background market-signals system kept as a compact companion feed. It remains useful as a secondary "large actions" context layer, but it no longer defines the page.

This avoids deleting current work while shifting the page toward a more useful and free-to-source product.

## Scope

### In scope for v1

- keep existing `market signals` block on the page in compact form;
- add a new primary screener backed by shared backend metrics;
- support price-velocity detection;
- support volume-spike detection;
- support open-interest delta analysis where available;
- support a composite screener score;
- allow opening a chart from screener rows and signal rows;
- expose a shared summary API for the screener;
- expose a shared screener feed API for the page;
- preserve centralized computation and avoid per-user market calculations.

### In scope for v1.1 if cheap enough

- taker buy/sell imbalance;
- liquidation pressure rows and summary;
- compression-to-expansion detection;
- screener notifications for high-conviction events.

### Explicitly out of scope

- wallet tracking;
- token transfer intelligence;
- smart-money address monitoring;
- paid vendor datasets;
- per-user custom screener calculations;
- full raw historical storage of all external market events.

## Data Sources

The screener should rely on free official exchange data that is stable enough for server-side ingestion.

### Primary sources

- `Binance Futures`
  - price/trades;
  - open interest;
  - open interest statistics;
  - taker buy/sell volume;
  - liquidation streams.
- `Bybit`
  - open interest;
  - trade data;
  - funding context if needed later.
- `OKX`
  - open interest;
  - liquidation context;
  - public trades.

### Secondary sources

- `Coinbase`
  - spot trade context.
- `Hyperliquid`
  - optional contextual market-activity source, not the primary screener backbone.

### Coverage expectations

This product will not see events from exchanges that are not connected. That is acceptable for v1 as long as the page is honest and useful. The purpose is not universal coverage; it is to build a strong free screener based on meaningful public market data.

## User Experience

The page must remain visually native to the app. It should feel like the current terminal/screener product, not like a separate dashboard.

### Layout

Top section:

- page title and controls;
- global screener filters;
- summary cards.

Main body:

- primary `Market Screener` table;
- compact `Signals Feed` side rail or lower compact block;
- optional selected-row detail panel.

### Primary actions

Every screener row and signal row should support:

- `Open Chart`
  - switch app to `terminal`;
  - select the symbol;
  - select exchange when relevant;
  - optionally set a helpful default timeframe.

Future optional action:

- `Pin to Grid`
  - not required for v1.

## Screener Model

The screener should work from a normalized shared metrics model instead of exchange-specific UI objects.

### Core row entity

`ScreenerRow`

Required fields:

- `id`
- `symbol`
- `baseAsset`
- `marketType`
- `primaryExchange`
- `lastPrice`
- `priceChange1m`
- `priceChange5m`
- `priceChange15m`
- `volumeNow`
- `volumeAvg`
- `volumeSpikeRatio`
- `openInterestNow`
- `openInterestChangePct`
- `takerBuyRatio`
- `liquidationUsd`
- `score`
- `state`
- `reasons`
- `updatedAt`

### State labels for v1

- `Momentum`
- `Breakout Watch`
- `OI Build`
- `OI Unwind`
- `Volume Expansion`
- `Short Squeeze Risk`
- `Long Liquidation Risk`

These labels should be interpretable by a normal user and not read like raw infrastructure.

## Screener Signals

### V1 signal classes

1. `Price Velocity`
   Detect unusually large percentage price changes in short windows such as `1m`, `5m`, and `15m`.

2. `Volume Spike`
   Detect when current rolling volume is significantly above recent baseline, for example `3x` or `5x` average.

3. `OI Delta`
   Detect significant futures open interest change and classify it against price direction:
   - price up + OI up;
   - price down + OI up;
   - price up + OI down;
   - price down + OI down.

4. `Composite Score`
   Rank rows based on a weighted combination of price velocity, volume spike, and OI delta.

### V1.1 signal classes

5. `Taker Imbalance`
   Detect aggressive buy/sell domination.

6. `Liquidation Pressure`
   Detect bursts of liquidations that strengthen squeeze or capitulation interpretation.

7. `Compression -> Expansion`
   Detect narrow-range quiet periods followed by coordinated breakout conditions.

## Backend Architecture

The new screener must be independent from the number of active users.

### Main components

#### `ScreenerIngestService`

Responsibilities:

- subscribe to shared market feeds and REST metrics on a controlled schedule;
- maintain a fixed screener universe;
- collect price, volume, OI, and optional liquidation inputs.

#### `ScreenerMetricsStore`

Responsibilities:

- keep rolling windows in memory;
- update metrics incrementally instead of recomputing from scratch;
- expose cheap read methods for current screener state.

#### `ScreenerSignalEngine`

Responsibilities:

- compute screener rows from current metrics;
- assign `state`, `score`, and `reasons`;
- enforce minimum thresholds;
- output ranked shared snapshots.

#### `ScreenerQueryService`

Responsibilities:

- provide summary, feed, detail, and health responses for the UI;
- serve precomputed snapshots only.

#### `ScreenerHealthService`

Responsibilities:

- track last successful ingest per source;
- report stale metrics or disabled sources for debugging and UI health.

## Performance Constraints

This page must not create chart regressions or per-user compute load.

### Hard rules

- no screener computation on page open;
- no per-user exchange polling;
- no coupling between chart subscriptions and screener ingestion;
- no full recomputation on every incoming trade;
- no alert broadcast to uninterested clients.

### Shared-compute model

- one backend universe;
- one backend metrics store;
- one shared screener snapshot;
- users only fetch or subscribe to the shared result.

### Universe strategy

Use a bounded configurable universe such as:

- top liquid futures symbols;
- optional secondary spot list.

The initial universe should be conservative, for example `50-100` symbols, so the product stays cheap and fast.

## API Surface

### Required endpoints

- `GET /screener`
  - ranked screener rows;
- `GET /screener/summary`
  - top-level counts and aggregate state;
- `GET /screener/health`
  - last ingest and source freshness.

### Existing signal endpoints remain

- `GET /signals`
- `GET /signals/summary`
- `GET /signals/alerts`
- `GET /signals/health`

The page will consume both systems, but the screener becomes the primary read model.

## Frontend Design

The page should be refactored, not redesigned from scratch.

### Primary page structure

#### `Market Screener`

Main table with:

- symbol;
- price change;
- volume spike;
- OI change;
- score;
- state;
- `Open Chart` action.

#### `Signals Feed`

Compact secondary block with:

- latest compact signal cards or rows;
- type badge;
- exchange list;
- size;
- `Open Chart` action.

#### Detail panel

Selecting a screener row should show:

- current price context;
- change windows;
- volume ratio;
- OI change;
- reasons for classification.

## Error Handling

- stale or missing OI must not break the whole screener;
- unsupported metrics on a source should degrade gracefully;
- the UI should clearly indicate stale or unavailable data rather than silently showing nonsense;
- health state should make failures observable during debugging.

## Testing Strategy

### Backend

- unit tests for rolling metrics calculations;
- unit tests for price velocity, volume spike, and OI signal classification;
- unit tests for ranking and threshold logic;
- health tests for stale-source handling.

### Frontend

- rendering tests for screener summary and table states;
- interaction tests for row selection;
- action tests for `Open Chart`.

## Success Criteria

The page is successful when:

- it surfaces meaningful market changes before or during expansion;
- it stays fast and shared across all users;
- it does not degrade chart smoothness or reconnect behavior;
- it preserves the current app style;
- it gives the user a fast path from signal to chart analysis;
- it keeps the existing `Signals Feed` as useful supporting context without letting it dominate the page.
