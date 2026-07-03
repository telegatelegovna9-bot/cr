# DOM Bubble Tape Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the right-side DOM panel into a denser ladder with an in-panel real-time bubble tape overlay driven by real exchange trades, without changing chart size or adding server load.

**Architecture:** Keep the existing `orderbook` and `trade` subscriptions unchanged. Move bubble tape behavior into local client-side panel state with short-lived batched rendering for small prints and immediate rendering for large prints. Keep DOM calculations in `apps/web/src/lib/dom-tape.ts` and UI orchestration in `apps/web/src/components/charts/dom-tape-panel.tsx`.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS, node:test

---

### Task 1: Add tested helpers for bubble tape behavior

**Files:**
- Modify: `apps/web/src/lib/dom-tape.ts`
- Modify: `apps/web/src/lib/dom-tape.test.ts`

- [ ] Add failing tests for bubble tape ordering, burst sizing, and visible item trimming.
- [ ] Run the targeted test file and confirm the new tests fail for the missing helper behavior.
- [ ] Implement minimal pure helpers for converting real trades into bubble tape items and trimming visible history.
- [ ] Re-run the targeted test file and confirm it passes.

### Task 2: Redesign DOM panel layout around a central ladder zone

**Files:**
- Modify: `apps/web/src/components/charts/dom-tape-panel.tsx`

- [ ] Rework the panel from split DOM/table layout into a single ladder surface with a stronger mid-price zone.
- [ ] Keep all visuals contained inside the existing right panel width and height.
- [ ] Preserve current settings controls and market toggle behavior.

### Task 3: Add in-panel real-time bubble tape overlay

**Files:**
- Modify: `apps/web/src/components/charts/dom-tape-panel.tsx`

- [ ] Add local lightweight state for visible bubble tape items only.
- [ ] Render large prints immediately and batch smaller prints on a short client-side interval.
- [ ] Fade older visible bubbles while preserving real trade order and side/size mapping.

### Task 4: Verify regression and type safety

**Files:**
- Test: `apps/web/src/lib/dom-tape.test.ts`
- Test: `apps/web/src/lib/orderbook-identity.test.ts`

- [ ] Run `node --import ts-node/register --test apps/web/src/lib/dom-tape.test.ts apps/web/src/lib/orderbook-identity.test.ts`.
- [ ] Run `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`.
- [ ] Review the final DOM panel diff to confirm the chart container size and placement were not changed.
