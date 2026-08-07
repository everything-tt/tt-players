# Player Profile Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented player hero, rating section, and form section with one H2H-inspired raised profile summary card.

**Architecture:** Add a focused `PlayerProfileHero` component that receives profile/form/action data from `PlayerPage` and owns the rating query and hero presentation. Keep page orchestration in `PlayerPage`, add scoped CSS in a dedicated stylesheet, and protect the behaviour with source-contract tests plus the existing mobile build and test suites.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Vite, existing TT Players app-kit and CSS tokens.

## Global Constraints

- Player identity remains the main headline.
- Rating, rank, confidence, likely range, win rate, and form tiles live inside one raised hero card.
- Win rate is a supporting metric, not an oversized spotlight.
- Default actions are Save/Follow, Share, View Rating History, and Insights.
- For the current user, hide Save/Follow, show the three everyday actions, and place `Claimed as your profile · Undo claim` in a quiet footer with confirmation before unlinking.
- Preserve loading, unavailable, provisional, sharing, favourite, identity, navigation, and rating-range behaviours.
- Add no new dependency or token system.

---

### Task 1: Define the hero integration contract

**Files:**
- Create: `apps/mobile/src/components/player-profile-hero.test.ts`

**Interfaces:**
- Consumes: `PlayerPage.tsx`, future `PlayerProfileHero.tsx`, and its stylesheet.
- Produces: source-level regression checks for component extraction, action exclusivity, unified metrics, and removal of standalone rating/form sections.

- [ ] **Step 1: Write the failing test**

Create Vitest checks that require `PlayerPage` to render `PlayerProfileHero`, prohibit direct `PlayerRatingPanel` rendering and the old standalone Form section, and require the new component to include rating/rank/confidence/range/win-rate/form labels plus the conditional current-user action branch.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tt-players/mobile test -- player-profile-hero.test.ts`
Expected: FAIL because `PlayerProfileHero.tsx` does not exist and `PlayerPage` still renders the old sections.

- [ ] **Step 3: Commit the failing contract**

Commit message: `test(mobile): define unified player profile hero contract`

### Task 2: Build the unified profile hero

**Files:**
- Create: `apps/mobile/src/components/PlayerProfileHero.tsx`
- Create: `apps/mobile/src/player-profile-hero.css`
- Modify: `apps/mobile/src/PlayerPage.tsx`

**Interfaces:**
- Consumes: profile identity/stat primitives, form insight primitives, favourite/identity callbacks, `ShareTarget`, `usePlayerRatingQuery`, `useShareTarget`, and existing navigation callbacks.
- Produces: `PlayerProfileHero(props)` with one raised card containing identity, actions, rating summary, expandable likely range, supporting win rate, form tiles, and recent-result badges.

- [ ] **Step 1: Implement the component minimally to satisfy the contract**

Create typed props for player identity, totals, form data, loading/error state, current-user/favourite state, share target, and callbacks. Query rating inside the component and render the approved action hierarchy and unified summary.

- [ ] **Step 2: Integrate it into PlayerPage**

Replace the old `tt-player-hero`, standalone `PlayerRatingPanel`, and standalone Form section with one `PlayerProfileHero`. Remove now-unused imports while preserving current-season and recent-match sections.

- [ ] **Step 3: Add scoped H2H-inspired presentation**

Use a raised rounded surface, compact identity header, action grid, responsive metric grid, likely-range disclosure, and three form tiles. Reuse existing semantic CSS variables and preserve dark-mode readability.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @tt-players/mobile test -- player-profile-hero.test.ts my-tt-behavior.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(mobile): unify player profile hero`

### Task 3: Verify the complete mobile change

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: completed hero integration.
- Produces: a buildable, tested PR.

- [ ] **Step 1: Run the mobile test suite**

Run: `pnpm --filter @tt-players/mobile test`
Expected: PASS.

- [ ] **Step 2: Run the mobile production build**

Run: `pnpm --filter @tt-players/mobile build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Review the diff for stale old-hero rendering**

Confirm `PlayerPage` no longer imports or renders `PlayerRatingPanel`, no standalone Form section remains, and current-user action exclusivity is explicit.

- [ ] **Step 4: Open the pull request**

Use a PR summary that explains the unified raised hero, action rules, preserved behaviour, and verification commands.
