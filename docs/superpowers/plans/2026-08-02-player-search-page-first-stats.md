# Player Search Page-First Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent global name searches from aggregating every eligible rubber before pagination.

**Architecture:** Keep the existing legacy query for blank, saved-only, and league-scoped requests. For the active global name-search path, resolve canonical matches, count and page them in stable name/id order, expand only that page to source-player IDs, and aggregate wins/played through the existing partial rubber indexes.

**Tech Stack:** Fastify, TypeScript, Kysely raw SQL, PostgreSQL, Vitest, Supertest.

## Global Constraints

- Preserve the response envelope and stable `name`, `id` pagination order.
- Preserve canonical-player and alias matching semantics.
- Preserve displayed all-time singles `wins` and `played` counts, excluding walkovers and deleted records.
- Do not add a database migration unless the revised production plan demonstrates a missing index.
- The current Players UI performs global search and does not expose league filtering.

---

### Task 1: Add a query-shape regression test

**Files:**
- Create: `apps/api/src/__tests__/player-search-query-shape.test.ts`

- [x] Add a focused test that requires paged and source-player CTEs to precede rubber aggregation.
- [x] Require both home and away branches to start from the paged source-player set.

### Task 2: Page global name matches before match aggregation

**Files:**
- Modify: `apps/api/src/routes/players.ts`

- [x] Select matching canonical players by name and optional saved IDs.
- [x] Apply `COUNT(*) OVER()`, stable ordering, `LIMIT`, and `OFFSET` before joining rubbers.
- [x] Expand only paged canonical IDs to active source-player IDs.
- [x] Aggregate home and away singles through the existing player/fixture partial indexes.
- [x] Retain the legacy query for paths whose ordering depends on activity or legacy league scope.

### Task 3: Cover common-name pagination

**Files:**
- Modify: `apps/api/src/__tests__/search-pagination.integration.test.ts`

- [x] Add 15 deterministic `Green Search` players.
- [x] Verify first and second pages, total, stable ordering, and `has_more`.

### Task 4: Verify and publish

- [ ] Run API TypeScript build.
- [ ] Run the query-shape test.
- [ ] Let normal PR CI run the PostgreSQL integration suite.
- [ ] Review the final diff for issue #90 scope only.
