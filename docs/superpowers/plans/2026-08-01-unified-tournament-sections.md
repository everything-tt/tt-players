# Unified Tournament Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present upcoming Table Tennis England events and recent tournament results as two independently paginated sections under one shared tournament search.

**Architecture:** Keep `/api/events` as the single list endpoint and call it with `status=upcoming` and `status=completed`. A reusable `useTournamentList` hook owns each section's offset, accumulated records, loading, retry, and end-of-list state while a single debounced search value resets both lists.

**Tech Stack:** React, TypeScript, TanStack Query, existing TT Players mobile design system.

## Global Constraints

- Use the existing `/api/events` endpoint for both sections.
- Load 20 records initially and 20 more per incremental request.
- Search must apply server-side to both sections and reset both pagination states.
- Upcoming and completed sections must keep independent loading, error, empty, and end states.
- Use existing `SearchPanel`, `PageSection`, `DesignList`, `ListItem`, `InfiniteListFooter`, `EmptyState`, and `ErrorState` components.
- Do not add page-specific card or spacing primitives.

---

### Task 1: Typed status-aware tournament query

**Files:**
- Modify: `apps/mobile/src/queries.ts`
- Modify: `apps/mobile/src/player-shared.ts`

**Interfaces:**
- Produces: `useEventsQuery({ query, status, limit, offset, enabled })`.
- Produces: lifecycle, venue, entry, information, results-source, and source-count fields on `EventItem`.

- [ ] Add an options-object query interface with `status` support.
- [ ] Include status in the query key and request parameters.
- [ ] Extend the event response types to the unified API contract.

### Task 2: Reusable independently paginated tournament list

**Files:**
- Create: `apps/mobile/src/hooks/useTournamentList.ts`
- Create: `apps/mobile/src/tournament-list.test.ts`
- Create: `apps/mobile/src/tournament-list.ts`

**Interfaces:**
- Consumes: status and debounced search.
- Produces: accumulated items, total, `hasMore`, loading flags, error, `loadMore`, and `retry`.

- [ ] Write tests for resetting and de-duplicating accumulated pages.
- [ ] Implement the page merge helper.
- [ ] Implement the hook with a 20-record default page size.

### Task 3: Two-section design-system tournament page

**Files:**
- Modify: `apps/mobile/src/EventsTabContent.tsx`

**Interfaces:**
- Consumes: two `useTournamentList` instances sharing the same search value.
- Produces: `Upcoming Tournaments` and `Recent Results` sections.

- [ ] Preserve the shared search and saved-tournament section.
- [ ] Render upcoming events nearest-first with date, category, venue, and lifecycle context.
- [ ] Render recent results newest-first with match counts.
- [ ] Give both sections independent loading, retry, empty, count, and infinite-scroll states.

### Task 4: Verification and PR

**Files:**
- Verify: mobile application and design-system guard.

- [ ] Run Mobile CI including tests, design-system validation, and production build.
- [ ] Run frontend build/deploy CI.
- [ ] Review the final diff for endpoint duplication or bespoke visual primitives.
- [ ] Open the PR to `main` and merge only after all required checks pass.
