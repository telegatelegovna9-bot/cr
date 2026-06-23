# TradingView-Style Range Tool Design

Date: 2026-06-23  
Status: Approved (ready for implementation planning)

## Goal

Replace the current custom chart ruler with a TradingView-style range tool that matches the standard market UX as closely as practical in both appearance and behavior.

The result must support:

- a persistent `Date and Price Range`-style drawing from the toolbar;
- a temporary `Shift`-measure interaction for quick inspection;
- one shared rendering and metrics engine for both modes;
- a visual result that no longer looks custom or app-specific.

## Scope

In scope:

- replacing the current `ruler` visual treatment and interaction model;
- unifying temporary and persistent measurement behavior;
- adding TradingView-style range metrics: price delta, percent, bars, time, volume;
- adding handle-based editing and whole-object dragging for the persistent tool;
- reusing already loaded chart candle history for metric calculation.

Out of scope:

- new remote data fetches just for measurement;
- unrelated drawing-tool redesigns;
- pixel-perfect cloning of proprietary TradingView internals where the current chart library cannot support them exactly.

## Current Context

- The current ruler is rendered in [primitive.ts](/C:/Users/fames_rd/Desktop/Aionuicr/apps/web/src/lib/drawings/primitive.ts).
- Pointer interaction and temporary `Shift` ruler creation live in [drawing-overlay.tsx](/C:/Users/fames_rd/Desktop/Aionuicr/apps/web/src/components/charts/drawing-overlay.tsx).
- Projection helpers live in [engine.ts](/C:/Users/fames_rd/Desktop/Aionuicr/apps/web/src/lib/drawings/engine.ts).
- Candle and volume history already exist in [chart-card.tsx](/C:/Users/fames_rd/Desktop/Aionuicr/apps/web/src/components/charts/chart-card.tsx), so range metrics can be derived locally.

## Product Requirements

The tool is considered correct only if all of the following are true:

- the toolbar tool behaves like a persistent range drawing, not like the current dashed annotation;
- `Shift`-measure and the toolbar range look the same while active;
- the active drawing shows shaded range geometry, clear boundary lines, visible endpoint handles, and a compact information label;
- the information label includes `price delta`, `%`, `bars`, `time`, and `volume` when data is available;
- upward and downward ranges use different color treatments;
- the persistent drawing can be selected, moved as a whole, and resized from both ends;
- the temporary `Shift`-measure never persists into drawing storage after release.

## Interaction Design

### Persistent Range Tool

The toolbar range tool should work like a normal TradingView range drawing:

- first click defines the start point;
- pointer movement previews the full range geometry;
- second click or pointer release finalizes the drawing;
- after creation, selecting the drawing reveals handles;
- dragging a handle adjusts one endpoint;
- dragging inside the range moves the whole object.

### Temporary Shift Measure

The quick measure mode should use the same geometry and metrics engine as the persistent tool:

- user holds `Shift` and drags on the chart;
- the temporary range appears immediately with the same shaded box and label;
- releasing the pointer ends the preview;
- no drawing entity is persisted to the store.

This keeps quick measurement and saved measurement visually and behaviorally consistent.

## Visual Design

The current amber dashed line and dark floating box must be removed for the ruler/range tool.

The replacement should include:

- a translucent filled rectangle spanning the selected time and price bounds;
- thin border lines around the range;
- a central guide line between anchor points;
- small visible endpoint handles for selected persistent ranges;
- a compact directional label styled like a standard market range tool rather than a custom annotation.

Directionality:

- upward range uses a positive color treatment;
- downward range uses a negative color treatment.

The objective is not a loose inspiration. The objective is a standard stock/crypto chart range tool appearance.

## Data and Metrics

Both temporary and persistent modes should compute the same metrics from the chosen endpoints:

- absolute price delta from `p1.price` to `p2.price`;
- percentage move relative to `p1.price`;
- number of bars included in the horizontal span;
- elapsed time across the selected bars;
- summed candle volume across the selected bars.

Volume should be computed from the already loaded local candle history. No dedicated measurement API or extra background fetch is required in this iteration.

If part of the selected span extends beyond loaded history, the tool should still render, while metrics should be based only on the loaded bars that overlap the selection.

## Architecture Changes

### Drawing Model

The existing `ruler` drawing should be redefined in practice as the persistent range tool rather than kept as a legacy custom ruler.

The drawing model should continue to store two endpoints:

- `p1`
- `p2`

No separate persisted model is needed for `Shift`-measure; temporary state should live only in overlay interaction state.

### Overlay and Rendering

The overlay layer should:

- support temporary active measurement state;
- distinguish between preview, selected, and idle rendering;
- expose hit targets for handles and body dragging;
- avoid preserving the current line-only ruler rendering path.

### Metric Source

The range tool needs access to chart candle history already held by the chart component so the overlay or primitive layer can derive:

- bars in range;
- time span;
- volume sum.

This should be passed through existing chart-local state rather than rebuilt from DOM or series snapshots.

## Error Handling and Constraints

- If candle history is unavailable, the range should still draw, but volume and bar/time metrics may degrade gracefully.
- Future-offset endpoints must continue to render correctly when the user measures into the right-side empty space.
- Off-screen anchors should remain projectable through the existing projection logic.
- The design should not introduce a second competing ruler tool.

## Testing Strategy

Unit coverage should include:

- range projection math;
- metric calculation for delta, percent, bars, time, and volume;
- temporary versus persistent lifecycle behavior;
- dragging body versus dragging endpoint behavior.

Integration coverage should include:

- toolbar range creation;
- `Shift` quick measure preview and disposal;
- selecting and editing a persisted range;
- metric correctness over loaded candle history;
- behavior when the selected span partially exceeds loaded candles.

## Recommended Delivery Shape

1. Refactor the current `ruler` path into a shared range-tool model and renderer.
2. Add temporary `Shift` measurement state that reuses the shared renderer and metric calculator.
3. Add persistent selection, handle hit-testing, and drag semantics.
4. Add metric computation from local OHLCV history.
5. Replace the existing custom visual treatment entirely.
