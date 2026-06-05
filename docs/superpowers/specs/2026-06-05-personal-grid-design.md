# Personal Grid Design

## Goal

Add a user-managed `Grid` workspace that lets the user keep a personal set of charts separate from the existing auto-filled grid. The user should be able to add, replace, remove, and expand charts while keeping the overall look and interaction style consistent with the current application.

This first version is `local-first`: the grid state is stored in the browser. The data model must be shaped so it can later be synced to a user account without redesigning the feature.

## Non-Goals

This scope does not include:

- multi-workspace management
- drag-and-drop slot reordering
- server persistence
- account-aware sync
- cross-device sync
- bulk import/export
- separate visual language from the rest of the app

## Product Behavior

The `Grid` tab becomes a personal workspace instead of a sorted market view.

The user gets:

- one personal grid
- layout options `1 / 4 / 6`
- up to six fixed chart slots
- empty slots with `+ Add Chart`
- filled slots that can be:
  - expanded
  - replaced
  - removed

The `expand` behavior is part of the grid, not a destructive mode change:

- one selected chart takes the full grid area
- the other configured charts remain stored
- those other charts are temporarily hidden, not removed
- leaving expanded mode restores the previous grid layout

Changing layout never deletes configured slots:

- switching from `6` to `1` or `4` only hides extra slots
- switching back restores them

## UX Flow

### Open Grid

When the user opens `Grid`, they see their personal workspace. If no charts have been configured yet, visible slots render as empty placeholders.

### Add Chart

The user clicks `+ Add Chart` in an empty slot.

A compact picker opens and allows choosing:

- symbol
- exchange
- market type (`spot` or `futures`)

After selection, the slot becomes a normal chart card.

### Replace Chart

The user opens slot actions on an existing chart and chooses `Replace`.

The same picker opens and writes the new selection into that slot.

### Remove Chart

The user chooses `Remove` on a slot.

The slot is cleared immediately and becomes empty again. No confirmation dialog is required in this first local-only version.

### Expand Chart

The user chooses `Expand` on a slot.

That slot fills the grid workspace. Other slots are hidden but remain configured. A clear `Back to Grid` / `Collapse` action returns the workspace to normal grid mode.

### Change Layout

The user can switch between `1 / 4 / 6`.

The active visible slot count changes, but slot data is preserved for all six slots.

## Information Architecture

This feature should be separated from the current market-sorted grid logic.

The current `ChartGrid` behavior is still useful as an auto-filled market overview, but the `Grid` tab requested here is a personal workspace. The implementation should avoid mixing:

- auto-populated symbols
- sort-based chart filling
- personal slot configuration

The personal grid should have its own state and rendering path, while reusing shared visual components such as `ChartCard`.

## UI Components

### PersonalGridView

Top-level view component for the `Grid` tab.

Responsibilities:

- render layout controls
- render visible slots
- manage expanded slot state
- open and close the chart picker

### PersonalGridSlot

Visual wrapper for each slot.

States:

- empty
- filled
- expanded

Responsibilities:

- render empty placeholder
- host a `ChartCard` when configured
- expose slot-level actions:
  - expand
  - replace
  - remove

### ChartPickerModal

Compact modal or popover for choosing chart content.

Initial controls:

- symbol input/search
- exchange selector
- spot/futures toggle

This picker should feel native to the existing app: same glass treatment, spacing, controls, and compact density.

## State Model

The feature should use a dedicated store slice for personal grid state.

Recommended shape:

```ts
type PersonalGridLayout = 1 | 4 | 6;

interface PersonalGridSlotConfig {
  id: string;
  symbol: string | null;
  exchange: string | null;
  marketType: 'spot' | 'futures' | null;
}

interface PersonalGridState {
  layout: PersonalGridLayout;
  slots: PersonalGridSlotConfig[];
  expandedSlotId: string | null;
}
```

Important behavior:

- always keep six fixed slots in state
- visible slots depend on `layout`
- hidden slots still retain configuration
- `expandedSlotId` only changes presentation, not stored slot contents

## Persistence

Persistence should use `localStorage` in the first version.

Requirements:

- restore the personal grid on app load
- save changes after:
  - add
  - replace
  - remove
  - layout change
- keep persistence logic isolated from rendering logic

The stored data should remain serializable with no transformation-heavy format so it can later be reused for server sync.

## Styling and Design Constraints

The feature must stay inside the established visual language of the app.

Requirements:

- same glass-card styling family
- same compact control density
- same spacing and border language
- no new foreign design system
- no oversized modals or generic CRUD-dashboard look

Empty slots should look intentional, not unfinished. They should invite adding a chart without feeling like missing content.

Expanded mode should feel like a natural zoom/focus state of the grid, not like navigation into a different screen.

## Technical Approach

Reuse existing `ChartCard` as much as possible. Avoid creating a second chart implementation.

The personal grid should own:

- slot assignment
- layout
- expanded state
- picker state

The chart component should continue owning:

- subscriptions
- timeframe changes
- market type behavior inside the chart
- drawing state behavior already tied to symbol/exchange/market type

## Future Compatibility

This first version should explicitly prepare for future account sync.

To support that later without redesign:

- keep state shape stable and serializable
- avoid coupling persistence directly to component trees
- isolate storage reads/writes behind store helpers or persistence helpers
- avoid embedding browser-only persistence assumptions into business logic

## Risks

### State Coupling

If personal grid state is mixed into the current auto-grid logic, the tab will become hard to reason about and future sync will be messy.

Mitigation:

- dedicated store slice
- dedicated view path
- shared chart rendering only where appropriate

### UX Bloat

If too many workspace-management controls are added now, the tab will feel heavier than the rest of the app.

Mitigation:

- one personal grid only
- no multi-workspace system
- no drag-and-drop in v1

### Persistence Drift

If the local format becomes ad hoc, later account sync will require migration work.

Mitigation:

- define the slot model clearly now
- keep the persisted payload close to future API shape

## Success Criteria

The feature is successful when:

- the user can configure up to six personal charts in `Grid`
- empty slots can be filled quickly
- filled slots can be replaced or removed easily
- one chart can be expanded to full grid view without losing the rest of the layout
- the grid restores correctly after refresh
- the design feels like part of the current application, not a bolted-on tool
