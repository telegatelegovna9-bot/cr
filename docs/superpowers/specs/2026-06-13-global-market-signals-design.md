# Global Market Signals Design

## Goal

Replace the current partial `Hyperliquid Flows` screen with a production-grade background signal system that aggregates important public market actions from multiple exchanges, stores them centrally, and serves a curated signal feed plus alerts to all users without per-user polling.

## Problem

The current implementation does not match the UI or product intent:

- real mode only ingests Hyperliquid `recentTrades`;
- those trades are mislabeled as `spot-transfer`;
- `TWAP started/done/cancelled` and `core transfer` exist only in mock/UI types;
- the feed is restricted to a small top-coin slice instead of broad market coverage;
- signals are not modeled as important market actions;
- the system is not designed as a shared background service with retention and alerts.

The result is a misleading product: the UI implies a global flow intelligence layer, but the backend currently provides a narrow trade poller.

## Product Direction

The new product is not a raw trade tape. It is a curated signal system that helps users answer:

- where aggressive buying is happening now;
- where aggressive selling is happening now;
- where large block-style activity is appearing;
- whether activity is isolated or confirmed across venues;
- whether a move is likely meaningful rather than noise.

The feed should show important participant actions, not every public execution.

## Scope

### In scope for v1

- background server-side ingestion from public exchange feeds;
- support for `Hyperliquid`, `Binance`, `Bybit`, `OKX`, and `Coinbase`;
- normalized multi-exchange trade ingestion;
- block-trade detection where the source provides it;
- clustering of repeated large trades into higher-level signals;
- cross-exchange confirmation logic;
- short and medium retention for feed and alerts;
- global alerts generated once on the backend;
- user-level notification controls limited to:
  - enable or disable this signal system;
  - minimum signal size threshold.

### Explicitly out of scope for free v1

- full global TWAP lifecycle parity with third-party flow products;
- full global transfer / ledger / internal movement intelligence;
- per-user custom alert rules beyond mute and minimum threshold;
- raw full-tape history retention;
- per-user exchange-specific live computations.

## User Experience

The existing visual language of the app must be preserved. The screen can change its information architecture, but it should still feel native to the current product.

The user should see:

- a live feed of meaningful market signals;
- high-level market summary cards;
- recent alerts;
- signal detail panels;
- clear labels about exchange, side, size, and why the system considers the event important.

The screen should no longer pretend to show unsupported signal classes. If a signal type exists in UI, it must be backed by real data in production mode.

## Signal Model

The system should use one internal normalized entity instead of exchange-specific UI objects.

### Core entity

`SignalEvent`

Required fields:

- `id`
- `timestamp`
- `exchange`
- `symbol`
- `baseAsset`
- `quoteAsset`
- `side`
- `eventType`
- `usdValue`
- `tradeCount`
- `price`
- `confidenceScore`
- `priorityScore`
- `isBlockTrade`
- `exchangesInvolved`
- `summary`
- `details`

### Event types for v1

- `large_buy`
- `large_sell`
- `block_trade`
- `buy_cluster`
- `sell_cluster`
- `cross_exchange_activity`
- `anomalous_activity`

### User-facing meaning

- `large_buy` / `large_sell`: one unusually important print;
- `block_trade`: a structurally important large trade from an exchange that exposes that label;
- `buy_cluster` / `sell_cluster`: repeated large same-direction actions over a short window;
- `cross_exchange_activity`: coordinated or overlapping activity on multiple venues;
- `anomalous_activity`: activity far above a token's recent baseline.

## Data Sources

### Public feeds to ingest in v1

- `Hyperliquid`: public trade data
- `Binance`: public spot/perp trade streams
- `Bybit`: public trade streams, including block-trade markers where available
- `OKX`: public trades and public block-trades channels
- `Coinbase`: public market trade streams

### Coverage expectations

If an exchange is not connected, its important actions will not appear in the system. There is no free universal source that covers all exchanges and all event classes. This product must be explicit about that limitation.

The v1 design aims for broad public trade coverage, not perfect vendor-grade flow parity.

## Background Architecture

The system must run as a shared backend service, not as logic triggered by page open.

### Main components

#### `MarketSignalIngestor`

Responsibilities:

- open and maintain long-lived public exchange connections;
- reconnect safely;
- push raw events into normalization;
- remain independent from frontend traffic.

#### `ExchangeAdapter`s

One adapter per exchange:

- `hyperliquid.adapter`
- `binance.adapter`
- `bybit.adapter`
- `okx.adapter`
- `coinbase.adapter`

Responsibilities:

- subscribe to public channels;
- parse source-specific payloads;
- emit a common raw event shape;
- expose source capability flags like `supportsBlockTrade`.

#### `SignalNormalizer`

Responsibilities:

- convert raw exchange events into common normalized trade events;
- compute `usdValue`, side, block-trade flags, and symbol metadata consistently.

#### `SignalAggregator`

Responsibilities:

- group large same-direction events into clusters;
- detect cross-exchange overlap;
- compute anomaly and priority scores;
- suppress duplicate or redundant noise.

#### `SignalStore`

Responsibilities:

- keep a short live window in memory;
- persist recent signals for UI and alert replay;
- expose efficient query methods for feed, summaries, and alert history.

#### `SignalAlertService`

Responsibilities:

- generate global alerts from prioritized signals;
- deduplicate noisy repeats;
- materialize alert records used by in-app and push-style notification delivery.

#### `SignalQueryService`

Responsibilities:

- provide the API used by the site;
- return feed items, summaries, filters, and recent alerts from shared storage only.

## Storage Strategy

This system must scale by computing once and serving many.

### Retention tiers

- in-memory live working window: `10-15 minutes`
- recent signal history in durable store: `1h-24h`
- alert history in durable store: enough to support recent notification review

### Storage policy

- do not store the full raw tape long-term;
- keep raw event retention minimal and in service of aggregation only;
- store normalized signal entities and alert entities;
- retain only what the product needs to render and notify.

Redis is preferred for live shared state if already present. Postgres can store recent persisted signal and alert history if needed for durability and inspection.

## Signal Rules

The system should prioritize significance over volume.

### Base filtering

- minimum ingest floor for trades;
- venue-specific and asset-specific normalization;
- ignore tiny prints and repeated low-information events.

### Scoring inputs

- absolute USD size;
- size relative to recent baseline for that asset on that venue;
- repeated same-direction prints in a small window;
- block-trade flag if available;
- cross-exchange confirmation;
- buy/sell imbalance over a short window.

### Output rules

- repeated large prints become one cluster signal, not dozens of feed rows;
- one token active on multiple venues should get a higher score than the same notional on one venue only;
- obvious low-value repeats should be suppressed.

## Alerts

Alerts are global first and user-filtered second.

### Global generation

The backend creates alerts once for all users from signal priority rules.

### User preferences

Users can only control:

- `signals notifications enabled`
- `minimum alert size`

This keeps the architecture cheap, shared, and scalable. It also keeps the product coherent instead of turning it into a personal rule engine.

## Frontend Design Constraints

- preserve the current app and website visual language;
- do not ship unsupported decorative categories;
- present signal types and labels that match real backend data;
- keep the feed understandable at a glance;
- keep the detail view contextual, not verbose for its own sake.

The screen should shift from "Hyperliquid Flows" as a narrow promise to a broader multi-exchange signal surface while remaining visually aligned with the app.

## Migration Plan

The old system should not remain as dead weight beside the new system.

### Migration principles

- do not keep fake or misleading categories alive in production UI;
- remove old `flows` mocks and types once they are no longer serving the site;
- remove logic that maps trades to fake `spot-transfer`;
- migrate the screen to the new signal API instead of layering more hacks into `flows.service`;
- if a temporary adapter layer is needed during rollout, it must have a clear deletion path.

## Codebase Shape

Recommended backend structure:

- `apps/api/src/modules/signals/signals.module.ts`
- `apps/api/src/modules/signals/signals.types.ts`
- `apps/api/src/modules/signals/signals.service.ts`
- `apps/api/src/modules/signals/signals.controller.ts`
- `apps/api/src/modules/signals/signals.store.ts`
- `apps/api/src/modules/signals/signals.aggregator.ts`
- `apps/api/src/modules/signals/signals.alerts.ts`
- `apps/api/src/modules/signals/adapters/hyperliquid.adapter.ts`
- `apps/api/src/modules/signals/adapters/binance.adapter.ts`
- `apps/api/src/modules/signals/adapters/bybit.adapter.ts`
- `apps/api/src/modules/signals/adapters/okx.adapter.ts`
- `apps/api/src/modules/signals/adapters/coinbase.adapter.ts`

Recommended frontend structure:

- `apps/web/src/lib/signals/`
- updated screener components built around `SignalEvent`

The current `flows` module should either become a compatibility/query layer during migration or be removed when fully replaced.

## Reliability and Scale

The service must support growth in users without growth in external market-data load.

### Performance constraints

- exchange connections are shared backend connections, not per-user;
- opening the screen only reads cached state;
- aggregation runs once centrally;
- user count should not multiply vendor traffic;
- no page-open-triggered source polling.

For 1000 users, the expected system load increase should be primarily read load against our own cache/storage and websocket fan-out, not more exchange ingestion work.

## Testing Requirements

The implementation must be testable at each layer:

- exchange adapter parser tests;
- normalization tests;
- cluster and scoring tests;
- suppression and dedup tests;
- storage retention tests;
- API contract tests;
- UI rendering tests for real signal types;
- alert-threshold tests for user preference filtering.

## Success Criteria

The design is successful when:

- the system runs in the background without requiring the screen to be open;
- signals are shared and retained centrally;
- the UI no longer advertises unsupported TWAP/transfer categories;
- large public market actions across the selected exchanges appear in one coherent feed;
- alerts can be generated globally and filtered by user threshold;
- the project contains one real production system, not old and new overlapping forever.

## Risks

- public feeds differ materially by exchange and need careful normalization;
- "important" activity scoring can drift toward too much noise or too much suppression;
- free public sources do not give full parity with premium flow products;
- migration can leave dead UI or dead types behind if cleanup is not enforced.

## Recommended Rollout

1. Build the backend signal pipeline and storage behind a new module.
2. Feed the UI from the new API while keeping styling consistent.
3. Remove unsupported legacy flow categories from production UI.
4. Add notification preferences and alert delivery hooks.
5. Delete obsolete `flows` artifacts once the new path is fully serving traffic.
