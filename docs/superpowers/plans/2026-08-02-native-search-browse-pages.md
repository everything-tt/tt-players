# Native Search Browse Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Players and Tournaments hero-search screens with compact native browse controls, paginate every browse/search result by scroll, and make the tournament detail hero responsive.

**Architecture:** Add reusable `SearchToolbar` and `AppToggleButton` primitives to the design system. Move Players into a focused root-tab component backed by paginated API data, extend both player and tournament list APIs with bounded saved-ID filtering, and preserve separate cached list state per active scope. Extend `EntityHero` with explicit action placement so detail screens cannot collapse long titles.

**Tech Stack:** React 18, TypeScript 5.7, TanStack React Query 5, Fastify 5, Kysely, Zod, Vitest, Playwright.

## Global Constraints

- Initial page size is exactly 10 for Players and Tournaments.
- Browse, typed search, saved-only, and saved-plus-search results all paginate and auto-load on scroll.
- Only the active lifecycle/league scope may issue list requests.
- Search text is retained when switching scopes.
- Saved filters are intersected with active scope and search before pagination.
- One- and two-character player queries do not fetch.
- Saved ID lists are UUID-validated and capped at 200.
- All controls have at least a 44px touch target and accessible selected semantics.
- Tournament detail actions render below identity on phones and never squeeze the title into character-by-character wrapping.

---

### Task 1: Design-system browse controls and responsive hero contract

**Files:**
- Create: `packages/design-system/src/components/SearchToolbar.tsx`
- Create: `packages/design-system/src/components/AppToggleButton.tsx`
- Modify: `packages/design-system/src/components/EntityHero.tsx`
- Modify: `packages/design-system/src/components/design-system-contract.test.tsx`
- Modify: `packages/design-system/src/index.ts`
- Modify: `packages/design-system/src/styles/primitives.css`

**Interfaces:**
- Produces: `SearchToolbar({ children, actions, ariaLabel?, className? })`
- Produces: `AppToggleButton({ pressed, iconClassName?, children, ...buttonProps })`
- Produces: `EntityHero.actionPlacement?: 'auto' | 'inline' | 'below'`

- [ ] Write failing static-markup tests for toolbar structure, toggle `aria-pressed`, and hero below-action class.
- [ ] Run `pnpm --filter @tt-players/mobile test -- packages/design-system/src/components/design-system-contract.test.tsx` and confirm the new exports/classes are missing.
- [ ] Implement the two primitives, exports, and responsive CSS.
- [ ] Re-run the targeted mobile tests and production build.
- [ ] Commit the design-system change.

### Task 2: Paginated and saved-filtered list API contracts

**Files:**
- Modify: `apps/api/src/routes/players.ts`
- Modify: `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/__tests__/api.integration.test.ts`
- Modify: `apps/mobile/src/player-shared.ts`

**Interfaces:**
- `GET /api/players/search?q=&league_ids=&saved_ids=&limit=10&offset=0`
- Player response: `{ data, total, limit, offset, has_more }`
- `GET /api/events?status=&q=&saved_ids=&limit=10&offset=0`

- [ ] Write failing API integration tests for player pagination, offsets, saved-ID intersection, validation/capping, and tournament saved-ID filtering.
- [ ] Run `pnpm --filter @tt-players/api test -- api.integration.test.ts` and confirm response/filter assertions fail.
- [ ] Extend Zod schemas and SQL queries with deterministic ordering, total counts, and bounded saved IDs.
- [ ] Re-run API tests and backend typecheck.
- [ ] Commit API pagination/filter changes.

### Task 3: Reusable paged player hook and Players root screen

**Files:**
- Create: `apps/mobile/src/hooks/usePlayerList.ts`
- Create: `apps/mobile/src/PlayersTabContent.tsx`
- Create: `apps/mobile/src/player-list.test.ts`
- Modify: `apps/mobile/src/queries.ts`
- Modify: `apps/mobile/src/App.tsx`

**Interfaces:**
- `usePlayerList({ scope, search, leagueIds, savedIds, enabled, pageSize })`
- `PlayersTabContent` receives selected-league state and `onOpenLeagueSelector`.

- [ ] Write failing tests for page merge/deduplication and URL parameter construction for page 1/page 2/saved scope.
- [ ] Run the targeted mobile tests and confirm missing hook/helper failures.
- [ ] Implement the paged hook, compact scope tabs, search toolbar, Saved toggle, distinct empty states, and infinite footer.
- [ ] Remove the inline `SearchPanel` Players implementation from `App.tsx`.
- [ ] Re-run mobile tests/build and commit.

### Task 4: Tournaments native tabs, saved filter, and active-only search

**Files:**
- Modify: `apps/mobile/src/hooks/useTournamentList.ts`
- Modify: `apps/mobile/src/EventsTabContent.tsx`
- Modify: `apps/mobile/src/tournament-list.test.ts`

**Interfaces:**
- `useTournamentList({ status, search, savedIds, enabled, pageSize: 10 })`

- [ ] Write failing tests for saved-ID request parameters and active-tab list behavior helpers.
- [ ] Run targeted mobile tests and confirm failures.
- [ ] Replace `SearchPanel` and separate saved section with `SegmentedToggle`, `SearchToolbar`, `AppToggleButton`, one active list, and `InfiniteListFooter`.
- [ ] Ensure Upcoming loads first, Completed is lazy, and each scope retains loaded pages.
- [ ] Re-run mobile tests/build and commit.

### Task 5: Tournament detail responsive action placement

**Files:**
- Modify: `apps/mobile/src/EventDetailPage.tsx`
- Modify: `packages/design-system/src/components/design-system-contract.test.tsx`

**Interfaces:**
- Tournament `EntityHero` uses `actionPlacement="below"`.

- [ ] Add a failing markup contract asserting the tournament-compatible below-actions structure.
- [ ] Run the design-system test and confirm failure.
- [ ] Opt the tournament detail hero into below-action placement and ensure title wrapping uses words.
- [ ] Run mobile tests/build and commit.

### Task 6: Screenshot coverage and PR verification

**Files:**
- Modify: `apps/mobile/tests/ui-review/ui-review.spec.ts` or the current route manifest used by the screenshot workflow.

- [ ] Add Players, Tournaments, and a tournament detail route to screenshot coverage at phone widths.
- [ ] Run all mobile and backend checks in CI.
- [ ] Inspect PR screenshot artifacts for 320/360/412-width layout correctness.
- [ ] Fix any CI or visual regressions and re-run.
- [ ] Mark the PR ready for review only after required checks pass.
