# Tournament Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tournament search page load the full result set in server-paginated batches of 20 instead of showing only the latest 10.

**Architecture:** Reuse the existing events endpoint's `limit`, `offset`, and `total` contract. Keep pagination state in `EventsTabContent`, append de-duplicated pages, and use the shared infinite-list footer to trigger additional requests in browse and search modes.

**Tech Stack:** React, TypeScript, TanStack Query, TT Player design system.

## Global Constraints

- Fetch 20 tournaments per request.
- Search must run on the server across the full dataset.
- Use existing design-system components.
- Preserve loaded rows during incremental loading and retry.

---

### Task 1: Tournament list pagination

**Files:**
- Modify: `apps/mobile/src/EventsTabContent.tsx`

**Interfaces:**
- Consumes: `useEventsQuery(query: string, limit: number, offset: number)` returning `{ data, total }`.
- Produces: a tournament list that requests offsets `0, 20, 40, ...` and renders `InfiniteListFooter` in browse and search modes.

- [ ] **Step 1: Add or update a component test**

Assert that the first request uses a limit of 20, loading more advances the offset by 20, and changing the query resets the offset to zero.

- [ ] **Step 2: Run the focused test and confirm the old fixed-ten implementation fails**

Run the mobile package's focused test command for `EventsTabContent`.

- [ ] **Step 3: Implement the minimal UI change**

Set `PAGE_SIZE` to 20, remove `RECENT_LIMIT`, always call `useEventsQuery(debouncedQuery, PAGE_SIZE, offset)`, render all accumulated events, rename the section to `Tournaments` or `Search Results`, and always render `InfiniteListFooter` when rows exist.

- [ ] **Step 4: Run focused tests and type checking**

Run the component test, mobile test suite, and mobile TypeScript check.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/EventsTabContent.tsx
git commit -m "feat(mobile): paginate tournament list on scroll"
```
