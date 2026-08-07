# Full-page League Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile league bottom sheet with a responsive full-page modal and make multi-character search reliable and browseable.

**Architecture:** Extend the existing design-system `BottomSheet` with a page presentation so all modal accessibility and lifecycle behaviour remains shared. Keep league selection live in `App`; the picker owns only presentation, tab state, query state, and derived filtering.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, shared TT Players design system, CSS design tokens.

## Global Constraints

- Reuse design-system components and existing tokens; do not add a parallel component style.
- Preserve live selection callbacks and local persistence semantics.
- Keep modal focus trapping, Escape handling, scroll locking, focus restoration, and safe areas.
- Keep all common actions at least 44px.
- Add one PR-focused Playwright scenario and select only it in `playwright.ui-review.config.ts`.

---

### Task 1: Define full-page dialog contracts

**Files:**
- Modify: `packages/design-system/src/components/design-system-contract.test.tsx`
- Modify: `packages/design-system/src/components/BottomSheet.tsx`
- Modify: `packages/design-system/src/index.ts` only if exported types change
- Modify: `apps/mobile/src/native-mobile.css`

**Interfaces:**
- Produces: `BottomSheetProps.presentation?: 'sheet' | 'page'`
- Produces: `BottomSheetProps.description?: ReactNode`
- Produces: `BottomSheetProps.footer?: ReactNode`

- [ ] Add a failing static-markup contract test requiring page modifier classes plus description/body/footer slots.
- [ ] Run the design-system test and confirm it fails because the API/classes are absent.
- [ ] Add the minimal props and markup to `BottomSheet` while preserving the default sheet output.
- [ ] Add responsive page-layout CSS using existing surface, ink, border, radius, spacing, z-index, and safe-area tokens.
- [ ] Run design-system tests and typecheck.
- [ ] Commit the design-system page presentation.

### Task 2: Rebuild league scope around the page presentation

**Files:**
- Create: `apps/mobile/src/LeagueSelectionPage.contract.test.ts`
- Modify: `apps/mobile/src/LeagueSelectionPage.tsx`
- Modify: `apps/mobile/src/native-mobile.css`

**Interfaces:**
- Consumes: `BottomSheet presentation="page" description footer`
- Preserves: existing `LeagueSelectionPageProps` callback contract

- [ ] Add a failing source contract test requiring the page presentation, stable title/copy, deferred filtering, persistent query across tabs, browseable league list, and Done footer action.
- [ ] Run the focused mobile test and confirm it fails for the old 72% sheet implementation.
- [ ] Update the component to use the page presentation and existing design-system primitives.
- [ ] Keep `query` synchronous and derive `deferredQuery` with `useDeferredValue`.
- [ ] Search league name, season, and region metadata; show all leagues when query is empty.
- [ ] Keep the query when tabs change and expose a single Done close action.
- [ ] Add page-specific sticky-control/footer and compact-list CSS without hard-coded theme colours.
- [ ] Run focused tests, mobile tests, build, and typecheck.
- [ ] Commit the league picker behaviour and layout.

### Task 3: Add focused UI review and PR verification

**Files:**
- Create: `apps/mobile/tests/ui-review/zz-full-page-league-scope.pw.ts`
- Modify: `playwright.ui-review.config.ts`

**Interfaces:**
- Produces: one Playwright scenario selected by `testMatch`

- [ ] Add a scenario that seeds deterministic league data through route interception, opens League scope, and asserts full-page geometry.
- [ ] Type a three-or-more-character query one character at a time and assert the full value and filtered row.
- [ ] Verify Selected, Leagues, and Areas tabs, fixed action region, no horizontal overflow, and narrow viewport behaviour before screenshots.
- [ ] Capture only the approved league-scope views and write them to the existing UI-review manifest.
- [ ] Point `playwright.ui-review.config.ts` only to the new scenario.
- [ ] Run Playwright collection locally or in CI, then run the repository quality gates.
- [ ] Review the complete branch diff against this plan and open the PR with exact verification evidence.
