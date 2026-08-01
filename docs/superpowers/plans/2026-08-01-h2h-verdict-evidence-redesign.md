# H2H Verdict and Evidence Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented completed H2H layout with one dominant verdict and a compact, consistent evidence hierarchy.

**Architecture:** Move completed-matchup identity and actions into `RatingPredictionPanel`, which already owns prediction and analysis queries. Keep selection, saved matchups, direct history, and fixture navigation in `H2HTabContent`. Add a small scoped stylesheet for the new H2H layout without changing shared AppKit primitives.

**Tech Stack:** React, TypeScript, existing AppKit design-system components, existing rating and H2H query hooks, CSS custom properties.

## Global Constraints

- Preserve all existing H2H actions and navigation.
- Do not change API or database contracts.
- Reuse existing AppKit components and semantic tokens.
- Do not show a separate career win-rate header for a completed matchup.
- Do not render duplicate prediction explanations or a large zero-meetings empty state.

---

### Task 1: Build the dominant matchup verdict

**Files:**
- Modify: `apps/mobile/src/components/RatingPredictionPanel.tsx`
- Create: `apps/mobile/src/h2h-ui.css`

- [ ] Add optional matchup actions and direct-meeting count to `RatingPredictionPanelProps`.
- [ ] Render matchup title, action row, verdict statement, probability comparison, rating values, probability bar, and confidence in one leading `PageSection`.
- [ ] Use scoped responsive styles so the title and verdict remain dominant on narrow screens.

### Task 2: Consolidate evidence

**Files:**
- Modify: `apps/mobile/src/components/RatingPredictionPanel.tsx`

- [ ] Remove the Match preparation section.
- [ ] Replace the existing success-icon reason list with consistent compact rows for rating, recent form, shared opponents, and direct meetings.
- [ ] Keep common opponents as the main detailed drill-down with existing pagination.

### Task 3: Simplify the H2H container

**Files:**
- Modify: `apps/mobile/src/H2HTabContent.tsx`

- [ ] Remove the completed-matchup career win-rate header.
- [ ] Pass actions and encounter count into the prediction panel.
- [ ] Remove the duplicate Why this prediction section and the large no-meetings empty state.
- [ ] Keep direct score, competition breakdown, and meeting history only when encounters exist.

### Task 4: Verification

- [ ] Run mobile typecheck and targeted tests.
- [ ] Verify selection, saved matchup, swap, favourite, share, clear, common-opponent pagination, and fixture navigation.
- [ ] Review the completed page at a narrow mobile viewport for title wrapping, action layout, evidence density, and absence of duplicate sections.