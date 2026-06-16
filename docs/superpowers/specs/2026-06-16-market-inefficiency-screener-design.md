# Market Inefficiency Screener Design

## Goal

Replace the current screener behavior with a product-grade market inefficiency scanner that is:

- useful for both novices and advanced users;
- focused on rare, strong, explainable setups instead of generic market noise;
- split cleanly between `Spot` and `Futures`;
- cheap for users to consume because all heavy work is computed once on the backend;
- native to the existing application style and navigation.

The product should be strong enough to position as a premium feature on the site.

## Product Thesis

The current screener is structurally closer to a ranked list of short-term market activity than to a real inefficiency engine. It detects motion, but it does not reliably separate:

- true cross-exchange dislocations;
- spread and liquidity stress;
- accumulation or distribution pressure;
- breakout pressure after compression;
- derivatives-driven squeeze or flush conditions.

The new product should not try to be a giant generic scanner. It should be a guided scanner that highlights only rare and useful setups with clear explanations and direct chart handoff.

## Primary Product Requirements

The product is considered failed if any of these are routinely true:

- a surfaced signal cannot be explained in one short human sentence;
- `Spot` and `Futures` logic are mixed without clear separation;
- multiple unrelated setup types are collapsed into one undifferentiated score;
- the product mostly alerts after the move is already obvious;
- the computation requires heavy per-user work;
- the row does not imply a user action such as `watch`, `wait for confirmation`, `risk of squeeze`, or `dislocation`;
- a novice cannot understand why the asset is listed.

The product is considered successful when:

- `Best Setups` is short and high quality;
- weak rows are intentionally omitted;
- each detector class has clear guardrails against false positives;
- the page remains fast and consistent with the rest of the app;
- the user can move from signal to chart with minimal friction.

## Product Shape

The new screener should be a three-mode workspace:

- `Best Setups`
- `Spot`
- `Futures`

### Best Setups

This is the primary sellable surface. It must show only rare or actionable events. It is not a general market table.

Rules:

- show approximately `5-10` events at a time;
- prefer emptiness over low-quality noise;
- do not allow one symbol to occupy multiple rows for the same underlying event;
- every row must have a setup label, strength, freshness, one-line reason, risk note, and chart action.

### Spot

This mode shows spot-specific detector feeds and explanations.

### Futures

This mode shows derivatives-specific detector feeds and explanations.

## Detector Strategy

The product should not be driven by one global score. It should be driven by independent detector families with their own thresholds, then promoted into a unified shortlist.

### Promotion Model

Each detector should assign one of:

- `ignore`
- `watch`
- `actionable`
- `rare`

`Best Setups` should only include:

- `rare`;
- and optionally top `actionable` events if the market is otherwise quiet.

Each detector must first pass its own internal quality gate before competing for the shared shortlist.

## V1 Detectors

### Spot Detectors

#### 1. Cross-Exchange Divergence

Find symbols whose price on one exchange deviates materially from the multi-exchange baseline and persists long enough to matter.

Inputs:

- normalized price deviation versus multi-exchange median or weighted baseline;
- persistence over a short window;
- volume or trade activity confirmation;
- penalty for low-liquidity or unreliable markets.

Why it exists:

- this is a direct inefficiency signal rather than a generic momentum signal.

Guardrails:

- ignore tiny deviations;
- ignore one-tick flashes;
- ignore structurally thin markets with meaningless divergence.

#### 2. Spread Stress

Find symbols where spread deteriorates sharply relative to normal conditions and directional pressure is present.

Inputs:

- current spread versus rolling spread baseline;
- change in best bid/ask depth when available;
- local price jump context;
- liquidity deterioration signals.

Why it exists:

- this can expose fragile market structure before or during a meaningful move.

Guardrails:

- exclude permanently wide-spread junk markets;
- require a stable baseline before classifying stress.

#### 3. Absorption / Accumulation

Find symbols that remain in a relatively contained range while execution pressure and activity continue to build.

Inputs:

- compressed price range over a sustained window;
- stable or rising trade activity;
- repeated defense or rejection around a meaningful local area;
- failed attempts to leave the range.

Why it exists:

- this is the main early-structure detector for possible expansion.

Guardrails:

- strict thresholds;
- do not claim accumulation from simple sideways drift;
- degrade confidence if order flow quality is weak.

#### 4. Breakout Pressure

Find symbols that move from compression into expansion with confirmation.

Inputs:

- range compression;
- expansion in rolling volume;
- breakout from local structure;
- short retention beyond the broken range.

Why it exists:

- easy to explain, useful for novices, still valuable for advanced users.

Guardrails:

- do not classify every quick move as breakout pressure;
- require at least one structural confirmation beyond simple price percentage change.

### Futures Detectors

#### 1. OI Build Pressure

Find cases where open interest expansion is aligned with meaningful price context rather than random drift.

Inputs:

- open interest delta;
- short-window price delta;
- taker imbalance;
- perp context relative to spot where available.

Why it exists:

- helps distinguish position-building pressure from ordinary movement.

Guardrails:

- ignore isolated OI changes without directional context;
- down-rank when volume confirmation is weak.

#### 2. Squeeze Risk

Find setups where positioning and flow create meaningful squeeze vulnerability before the squeeze fully unfolds.

Inputs:

- skewed taker flow;
- open interest growth;
- compressed or vulnerable local structure;
- directional fragility near a local range edge.

Why it exists:

- highly sellable and practically useful if surfaced early enough.

Guardrails:

- do not surface post-event squeezes as early risk;
- require alignment between flow, OI, and structure.

#### 3. Liquidation Flush

Find forced-position unwind behavior rather than ordinary trend movement.

Inputs:

- sharp move;
- OI collapse or unwind;
- aggressive flow;
- worsening spread or liquidity conditions.

Why it exists:

- captures high-energy forced events that matter immediately.

Guardrails:

- do not surface every fast candle as liquidation flush;
- prefer event speed and derivatives confirmation over raw percent move.

#### 4. Perp vs Spot Divergence

Find cases where perpetual futures behavior is materially more aggressive than spot.

Inputs:

- perp move versus spot move;
- support from OI and taker data;
- persistence rather than one-sample divergence.

Why it exists:

- distinguishes derivatives-led stress or overheating from healthier spot-led movement.

Guardrails:

- require stable spot reference;
- discard micro divergences that normalize immediately.

## Best Setups Assembly

`Best Setups` should be constructed through the following steps:

1. Run cheap feature calculations across the bounded shared universe.
2. Let each detector nominate candidates using its own rules.
3. Promote only candidates that pass detector-specific quality gates.
4. Assign promotion tier: `watch`, `actionable`, `rare`.
5. Merge duplicate events so one underlying market event does not appear multiple times.
6. Publish only the strongest non-duplicated shortlist.

Important rules:

- no generic market-wide feed masquerading as best setups;
- no soft threshold rows just to keep the list populated;
- a setup must have a clear explanation sentence or it does not qualify.

## Backend Architecture

The backend should be reorganized into four layers.

### 1. Market Feature Layer

Compute shared rolling features for the entire bounded universe:

- short-window returns;
- rolling volume anomaly;
- spread baseline deviation;
- range compression metrics;
- open interest delta;
- taker imbalance;
- exchange-relative price deviation;
- perp versus spot divergence.

This layer must stay cheap enough to run continuously.

### 2. Detector Layer

Separate modules per setup class:

- `spot-cross-exchange-detector`
- `spot-spread-stress-detector`
- `spot-accumulation-detector`
- `spot-breakout-pressure-detector`
- `futures-oi-build-detector`
- `futures-squeeze-risk-detector`
- `futures-liquidation-flush-detector`
- `futures-perp-spot-divergence-detector`

Each detector owns:

- thresholds;
- explanation generation;
- guardrails;
- strength classification.

### 3. Candidate Promotion Layer

Responsibilities:

- normalize detector outputs;
- assign `watch | actionable | rare`;
- merge duplicates;
- generate the final `Best Setups` shortlist.

### 4. Read Model Layer

Responsibilities:

- expose lightweight UI-facing models;
- keep frontend rendering simple;
- avoid frontend interpretation of raw detector internals.

## Performance Model

The screener must remain shared and low-latency without becoming a per-user computational burden.

### Hard Rules

- no heavy compute on page open;
- no per-user exchange polling;
- no chart subscription coupling;
- no full expensive detector passes on every minor tick;
- no requirement for every detector to run at full cost on the full universe.

### Three-Step Cost Strategy

#### Step 1: Cheap Watch Layer

Run lightweight metrics continuously across the full universe.

#### Step 2: Expensive Confirmation Layer

Run heavier checks only for promoted candidates, such as:

- deeper cross-exchange validation;
- spread stress confirmation;
- stronger derivatives context checks.

#### Step 3: Snapshot Publication

Publish compact shared snapshots for:

- `Best Setups`
- `Spot`
- `Futures`
- detail read models

### Universe Strategy

Use bounded coverage rather than total market coverage.

Initial target:

- liquid spot symbols;
- liquid futures symbols;
- stronger exchanges only.

This is acceptable because the product goal is high-value detection, not universal exchange coverage.

## API Design

The current single generalized feed should be replaced or supplemented with explicit read models.

Required endpoints:

- `GET /screener/best-setups`
- `GET /screener/spot`
- `GET /screener/futures`
- `GET /screener/detail/:id`
- `GET /screener/summary`
- `GET /screener/health`

The legacy generalized screener feed may remain temporarily during migration, but the new frontend should not depend on it long term.

## Frontend Design

The page should remain visually native to the current application rather than becoming a generic analytics dashboard.

### Main Structure

Top level:

- mode switch: `Best Setups | Spot | Futures`;
- compact summary band;
- search or light filtering only where it adds real value.

Main content:

- primary event list;
- detail panel;
- compact `Signals Feed` as a supporting block, not the primary product.

### Event Row Requirements

Each surfaced event should show:

- symbol;
- setup label;
- strength tier;
- freshness;
- one-line reason;
- risk note;
- `Open Chart`.

The row must feel like a conclusion, not like raw telemetry.

Example structure:

- `SOLUSDT`
- `Breakout Pressure`
- `Strong`
- `18s ago`
- `22m compression broke with 3.1x volume and stable spread`
- `Risk: needs hold above range`

### Detail Panel Structure

The detail panel should explain the event through sections:

- `What changed`
- `Why flagged`
- `What confirms`
- `What invalidates`
- `Market context`

Only detector-relevant metrics should be shown. Do not dump every metric for every event.

### Beginner Layer

The page should expose a simplified interpretation tier:

- `Watching`
- `Actionable`
- `High Risk`
- `Event In Progress`

These labels should complement detector-specific language so a novice can understand urgency and intent without learning every metric first.

### UI Guardrails

- do not emphasize average score as a primary product metric;
- do not pack event rows with too many metric pills;
- do not keep weak rows just to make the page look active;
- do not show mixed detector outputs without context.

## Event Shape

The new UI should rely on an event-shaped model rather than a generic screener row.

Suggested shared event fields:

- `id`
- `symbol`
- `marketMode`
- `detectorType`
- `strengthTier`
- `headline`
- `reason`
- `riskNote`
- `freshnessMs`
- `primaryExchange`
- `chartTimeframe`
- `supportingMetrics`
- `confirms`
- `invalidates`

This allows detector-specific explanations while preserving a consistent UI.

## Migration Strategy

Do not rewrite the system from zero unless code boundaries force it. Reuse the existing foundation where it helps:

- shared background computation model;
- rolling stores and sampling patterns;
- screener health reporting;
- chart handoff flow;
- existing page route and navigation.

The primary change is not "make the old score better." The primary change is:

- replace generic ranking with detector-driven event generation;
- replace mixed market logic with explicit `Spot` and `Futures` modes;
- replace metric-heavy rows with product-grade event summaries.

## Recommended Delivery Scope

### V1A

Launch with:

- `Spot Breakout Pressure`
- `Spot Cross-Exchange Divergence`
- `Futures OI Build Pressure`
- `Futures Squeeze Risk`
- new `Best Setups`

Reason:

- strongest value-to-complexity ratio;
- enough product differentiation to be meaningful;
- avoids the most fragile detector classes first.

### V1B

Add:

- `Spread Stress`
- `Perp vs Spot Divergence`

### V1C

Add:

- `Absorption / Accumulation`
- `Liquidation Flush`

Reason:

- these are more sensitive to false positives and should be added after the base engine and UI are proven.

## Risks

- accumulation detection can become self-deception if built on weak proxy data;
- cross-exchange divergence on poor markets can generate fake opportunity signals;
- soft thresholds will turn the product back into noise;
- excessively hard thresholds can make the page look empty.

The system must therefore prefer:

- fewer rows;
- stronger explanations;
- explicit false-positive guardrails;
- honest empty states over fake activity.

## Non-Goals

The following are explicitly out of scope for this screener design:

- smart-money wallet tracking;
- on-chain analytics;
- paid proprietary data vendors;
- per-user custom heavy compute;
- all-market universal coverage;
- a giant raw-data terminal with dozens of columns.

## Testing Strategy

### Backend

- unit tests for shared feature calculations;
- unit tests per detector;
- unit tests for promotion tiering and duplicate merging;
- stale-source and health-state tests;
- regression tests for false-positive guardrails on representative scenarios.

### Frontend

- render tests for mode switching;
- render and interaction tests for event list and detail panel;
- tests for `Open Chart` handoff;
- tests for empty, stale, and partial-data states.

## Final Recommendation

The correct direction is a detector-driven hybrid product:

- simple enough to read quickly;
- strong enough to market as a premium scanner;
- separated by `Spot` and `Futures`;
- curated through `Best Setups`;
- backed by shared low-latency computation;
- strict enough to surface only rare, strong, explainable events.

The implementation should optimize for signal quality and explainability first, not list size.
