# Liquidity Heatmap Redesign

Date: 2026-06-04
Status: Proposed

## Goal

Replace the current heatmap from a mostly decorative orderbook background into a useful, performant liquidity tool that helps users:

- find price magnets
- find likely reaction zones
- understand where liquidity is dense vs thin
- read the chart without being overwhelmed by noise

This redesign is explicitly a **liquidity map**, not a liquidation map.

## Current Problems

### Product problems

- The current heatmap reads as a colored background rather than a decision tool.
- The user cannot quickly tell which levels matter most above or below price.
- The labels `real`, `spoof`, `iceberg`, and `absorption` are too interpretive for the available data and create false confidence.
- The current UI does not explain the chart to a newer user.

### Visual problems

- Too many horizontal bands create visual noise.
- Color semantics are unclear.
- Bid/ask and level importance are not obvious at a glance.
- The user sees the current price and heat lines but not the meaning of those lines.

### Technical problems

- The rendering loop still depends on many raw levels.
- Meaningful levels are not separated from raw background bands.
- Advanced diagnostics live in the same conceptual layer as the primary visualization.

## Product Direction

The redesigned feature will use a two-tier model:

1. **Primary liquidity map**
   - simple
   - honest
   - understandable
   - useful by default

2. **Advanced diagnostics**
   - optional
   - hidden by default
   - low-noise
   - clearly secondary

The primary map should answer:

- Where is strong liquidity above price?
- Where is strong liquidity below price?
- What is the nearest price magnet?
- Where is the likely reaction zone?
- Where is the liquidity gap?

## Information Model

### Primary concepts

The default UI will expose these concepts instead of `real/spoof/iceberg/absorption`:

- **Liquidity Above**
  Large visible sell-side liquidity above current price.

- **Liquidity Below**
  Large visible buy-side liquidity below current price.

- **Nearest Magnet**
  The closest strong liquidity cluster likely to attract price.

- **Reaction Zone**
  A persistent liquidity cluster where price is more likely to react.

- **Liquidity Gap**
  A thin-liquidity area where price may move faster.

### Advanced concepts

These will remain available as optional diagnostics only:

- possible spoof
- possible refill
- repeated absorption

They must never dominate the default heatmap or define its main color model.

## Visual Design

### Layer 1: Background Heat Layer

Purpose: provide context, not signals.

Rules:

- Draw a soft density background based on aggregated liquidity buckets.
- Use low-noise opacity and avoid rainbow semantics.
- Use cool tones below price and warm tones above price.
- Weak liquidity should be nearly invisible.
- Strong liquidity should be brighter but still remain behind candles.

This layer should help users feel market density, not force them to interpret raw noise.

### Layer 2: Key Levels Layer

Purpose: surface the few levels that matter.

Display:

- top 1-3 strong levels above price
- top 1-3 strong levels below price
- strongest visible wall
- 1-2 liquidity gaps

Visual treatment:

- thin level lines
- small right-edge labels
- compact annotations like:
  - `Magnet Above · 1.2M`
  - `Reaction Below · 860K`
  - `Gap`

These levels are the main actionable output.

### Layer 3: Context Summary

Add a small summary block in the chart corner with:

- strongest liquidity above
- strongest liquidity below
- nearest magnet
- simple directional bias:
  - `pull up`
  - `balanced`
  - `pull down`

This gives a useful interpretation without requiring the user to study the full heatmap.

## UX Model

### Default mode

Default mode should be understandable by a new user:

- heatmap visible
- key levels visible
- summary visible
- advanced diagnostics hidden

### Controls

Primary controls should shift from internal engine settings to user-value settings:

- intensity
- minimum liquidity threshold
- visible depth window
- basic/pro toggle or diagnostics toggle

The current type toggles are not the right primary controls for most users.

### Advanced diagnostics panel

If enabled, diagnostics appear as subtle overlays:

- tiny markers
- secondary icons
- optional labels on hover only

They must not repaint the entire heatmap semantics.

## Data and Scoring Model

### Bucketing

Replace the raw level-first mental model with a bucket model:

- aggregate orderbook prices into price buckets
- bucket size depends on price scale and zoom context
- compute liquidity per bucket in USD
- keep buckets stable enough to avoid flicker

### Key level scoring

For each bucket, compute:

- size score
- persistence score
- proximity score
- local dominance score

Then derive:

- top level above
- top level below
- strongest level in viewport
- nearest magnet
- gap zones

### Reaction zones

A reaction zone is not just a large bucket. It also requires persistence and local significance.

### Magnets

A magnet is a strong nearby level likely to attract price before price reaches a more distant level.

### Gaps

A gap is a low-density band between stronger regions. It indicates easier price travel.

## Performance Design

### Architecture split

Split the current engine into three outputs:

- `backgroundBands`
- `keyLevels`
- `advancedMarkers`

The render layer should consume precomputed output, not infer meaning during paint.

### Update frequencies

Use different cadences:

- orderbook ingest: as updates arrive
- background aggregation: fast path
- key level recompute: throttled, around 4-6 times per second
- advanced diagnostics: also throttled, and only when enabled

### Rendering

- Continue using canvas overlay.
- Only redraw when the render model changes.
- Restrict the active price window around current price.
- Use top-N policies for visible signal objects.

### Hard limits

The first implementation should enforce:

- narrow active depth window around market
- bounded visible labels
- bounded markers
- no expensive classification in the paint loop

## First Implementation Scope

### In scope

- redesign heatmap to bucket-based background layer
- add key level extraction
- add right-edge key labels
- add context summary
- simplify controls around user-facing value
- move old type logic behind an advanced diagnostics toggle
- keep canvas-based rendering

### Out of scope

- liquidation estimation
- liquidation feeds
- OI-based liquidation zones
- Telegram alerts from heatmap signals
- hover teaching mode
- full beginner tutorial mode

## Error Handling and Edge Cases

- If orderbook data is sparse, show a minimal heat layer and avoid fake signals.
- If no strong levels exist, show only the background and a neutral summary.
- If a market is too thin, suppress advanced diagnostics.
- If rendering falls behind, degrade gracefully by lowering diagnostic refresh frequency before disabling the main heatmap.

## Testing Strategy

### Functional checks

- major pairs with dense books
- thinner pairs
- switching exchanges
- switching symbols
- switching chart timeframe
- toggling heatmap on/off
- toggling advanced diagnostics

### Visual checks

- candles remain visually primary
- labels stay readable
- no excessive flicker
- no misleading color dominance

### Performance checks

- single chart
- multiple charts open
- heatmap on/off comparisons
- sustained websocket orderbook updates

## Implementation Notes

- The current `LiquidityEngine` should not be incrementally patched into the final design if that keeps old semantics mixed into the new model.
- It is acceptable to keep parts of the existing engine temporarily, but the new API should be centered around bucket aggregation and key level extraction.
- Existing `real/spoof/iceberg/absorption` heuristics should be treated as optional diagnostics only.

## Recommendation

Build the first redesign as a focused liquidity product:

- background density
- key levels
- summary
- optional diagnostics

This gives a meaningful improvement in clarity, usefulness, and performance without pretending to provide liquidation intelligence from data we do not truly have.
