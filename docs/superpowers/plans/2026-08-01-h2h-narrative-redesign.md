# H2H Narrative Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized H2H hero states with a compact, coherent comparison flow covering selection, prediction evidence and direct history.

**Architecture:** Keep the existing H2H query and persistence logic in `H2HTabContent`. Recompose the rendered states with existing AppKit primitives and conditionally render direct-history content only when recorded meetings exist.

**Tech Stack:** React, TypeScript, AppKit design-system components, existing H2H hooks and query layer.

## Global Constraints

- Reuse existing AppKit primitives and semantic tokens.
- Preserve player selection, profile navigation, swapping, clearing, favourites and sharing.
- Do not change API contracts or database schema.
- Do not render multiple empty direct-history sections.

---

### Task 1: Compact selection state

**Files:**
- Modify: `apps/mobile/src/H2HTabContent.tsx`

- [x] Replace the raised hero section with a compact flat `PageSection`.
- [x] Remove the decorative second empty-state section.
- [x] Promote saved matchups directly beneath the player selector.

### Task 2: Compact completed-matchup summary

**Files:**
- Modify: `apps/mobile/src/H2HTabContent.tsx`

- [x] Replace the completed player-card hero with a compact matchup header.
- [x] Keep swap, favourite, share and clear actions available.
- [x] Show prediction before supporting detail.

### Task 3: Consolidated evidence and history

**Files:**
- Modify: `apps/mobile/src/H2HTabContent.tsx`

- [x] Consolidate prediction rationale under one section.
- [x] Render one indirect-evidence explanation when no direct meetings exist.
- [x] Render direct score, competition breakdown and meeting history only when encounters exist.

### Task 4: Verification

- [ ] Run the mobile typecheck and unit tests in CI.
- [ ] Review both empty and completed states on a narrow mobile viewport.
- [ ] Confirm saved matchup selection and all matchup actions still work.
