# Player Search Database Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove full-table rubber scans from player search, reject unsafe short text searches, and repair the six performance indexes missing from production.

**Architecture:** Use candidate-first aggregation for named, saved, and league-filtered searches by expanding sources through the indexed `canonical_player_id` column. Use fixture-first aggregation for blank recent browse because activity determines its ordering. Add an idempotent forward-only repair migration rather than modifying migration 022.

**Tech Stack:** TypeScript, Fastify, Zod, Kysely, PostgreSQL 18, Vitest, pnpm.

## Global Constraints

- Preserve the existing search response envelope, canonical IDs, totals, pagination, statistics, and ordering.
- Keep omitted or blank `q` valid; reject a non-empty trimmed `q` shorter than three characters.
- Do not modify an already-applied migration.
- All database behavior tests run against real PostgreSQL.
- Production verification is read-only.

---

### Task 1: Lock the player-search contract with failing tests

**Files:**
- Modify: `apps/api/src/__tests__/player-search-query-shape.test.ts`
- Modify: `apps/api/src/__tests__/search-pagination.integration.test.ts`

**Interfaces:**
- Consumes: `GET /api/players/search` and the SQL source in `apps/api/src/routes/players.ts`.
- Produces: Regression coverage for canonical source expansion, short-query validation, saved search, league activity filtering, and recent blank ordering.

- [ ] **Step 1: Update the query-shape assertion**

Require the optimized source expansion to contain:

```ts
expect(sourceExpansion).toContain('ON ep.canonical_player_id = pp.id');
expect(sourceExpansion).not.toContain('COALESCE(ep.canonical_player_id, ep.id) = pp.id');
```

Also assert that blank recent browse defines a materialized scoped-fixtures CTE before joining rubbers.

- [ ] **Step 2: Add API validation coverage**

Add requests proving `/search?q=ab` returns 400 while `/search`, whitespace-only `q`, and `q=abc` remain accepted.

- [ ] **Step 3: Add canonical alias and scoped-stat coverage**

Insert a canonical player, an alias pointing directly at it, rubbers recorded against both source IDs, and fixtures in selected/unselected leagues. Assert one canonical result, correct league-scoped `played`/`wins`, and stable totals.

- [ ] **Step 4: Add blank recent ordering coverage**

Insert recent and old fixtures for two canonical players. Assert blank browse only counts the 100-day activity window and orders by `played`, `wins`, `name`, then `id`.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @tt-players/api test -- src/__tests__/player-search-query-shape.test.ts src/__tests__/search-pagination.integration.test.ts
```

Expected: failures for the direct canonical join, fixture-first blank browse, and short-query validation.

---

### Task 2: Implement indexed search strategies

**Files:**
- Modify: `apps/api/src/routes/players.ts:12-45`
- Modify: `apps/api/src/routes/players.ts:690-895`

**Interfaces:**
- Consumes: `SearchQuerySchema`, `uuidArray`, canonical identity invariants, existing rubber/fixture indexes.
- Produces: The unchanged `SearchResponseSchema` payload with indexed execution paths.

- [ ] **Step 1: Enforce the text-search minimum in Zod**

Define `q` so trimmed empty input remains legal and non-empty input requires at least three characters:

```ts
q: z.string().refine(
  (value) => value.trim().length === 0 || value.trim().length >= 3,
  'q must be empty or contain at least 3 characters',
).optional(),
```

- [ ] **Step 2: Replace source expansion with the direct canonical join**

Use the invariant-preserving indexed form:

```sql
JOIN external_players ep
  ON ep.canonical_player_id = pp.id
```

Do not use a self-plus-alias `UNION ALL`, because canonical rows point to themselves and would be duplicated.

- [ ] **Step 3: Implement candidate-first named/saved/league search**

Construct canonical candidates from the name and saved-ID filters. For league-filtered searches, derive candidate activity through scoped fixtures before counting and paging. Aggregate home and away singles only for the paged source IDs, preserving league filters and `requireActivity` behavior.

- [ ] **Step 4: Implement fixture-first blank browse**

Materialize recent active fixtures first:

```sql
scoped_fixtures AS MATERIALIZED (
  SELECT f.id
  FROM fixtures f
  JOIN competitions c ON c.id = f.competition_id
  JOIN seasons s ON s.id = c.season_id
  WHERE f.date_played >= NOW() - INTERVAL '100 days'
    AND f.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND s.deleted_at IS NULL
)
```

Join rubbers from `scoped_fixtures` through `fixture_id`, canonicalize each participant with `external_players.canonical_player_id`, aggregate, then apply the existing recent ordering and pagination.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all focused tests pass.

- [ ] **Step 6: Run API type checking**

Run:

```bash
pnpm --filter @tt-players/api build
```

Expected: exit 0.

---

### Task 3: Add the forward schema-repair migration

**Files:**
- Create: `packages/db/src/migrations/039_restore_query_performance_indexes.ts`
- Create: `packages/db/src/__tests__/query-performance-index-repair.test.ts`

**Interfaces:**
- Consumes: Tables created by migrations 002 and 003 and index definitions currently declared by migration 022.
- Produces: Six idempotently restored index definitions on fresh and previously migrated databases.

- [ ] **Step 1: Write the migration test**

Create a dedicated temporary PostgreSQL database, run migrations 001-003, create the three legacy `*_updated_at` indexes that production has, run migration 039, then query `pg_indexes`. Assert the exact six new names and their leading columns/partial predicates.

Run:

```bash
pnpm --filter @tt-players/db test -- src/__tests__/query-performance-index-repair.test.ts
```

Expected: FAIL because migration 039 does not exist.

- [ ] **Step 2: Implement migration 039**

Create all six indexes using `CREATE INDEX IF NOT EXISTS` and the definitions from migration 022. Keep `down()` intentionally non-destructive because a fresh database may have received the same index names from migration 022 before migration 039 runs.

- [ ] **Step 3: Verify the migration test GREEN**

Run the Task 3 focused command. Expected: pass.

- [ ] **Step 4: Verify the full migration chain**

Run:

```bash
pnpm --filter @tt-players/db test -- src/__tests__/migration-chain.integration.test.ts
```

Expected: migration 039 executes and is recorded.

---

### Task 4: Production-shaped verification and documentation

**Files:**
- Modify if required by findings: `scripts/capture-query-plans.mjs`
- Modify: `docs/superpowers/specs/2026-08-02-player-search-database-performance-design.md`

**Interfaces:**
- Consumes: Completed search SQL and production read-only database access.
- Produces: Reproducible evidence that unique, common, blank, and scoped searches no longer perform avoidable full rubber scans.

- [ ] **Step 1: Run read-only production plans**

For representative unique and common names, run `EXPLAIN (ANALYZE, BUFFERS, SUMMARY)` inside `BEGIN READ ONLY` with a 20-second local statement timeout. Confirm source expansion uses `idx_external_players_canonical_player_id` and rubber access uses participant indexes.

- [ ] **Step 2: Run blank and scoped plans**

Confirm blank browse starts from recent fixtures and league-filtered search constrains fixtures before rubber aggregation. Record execution time and buffer counts in the PR description.

- [ ] **Step 3: Update durable plan capture only if necessary**

If the existing performance-plan script cannot reproduce the final search SQL without duplicating route implementation, leave it unchanged and document the manual verification. If it can share a stable exported query builder, add player-search capture and its unit coverage.

- [ ] **Step 4: Reconcile the design document**

Update operational notes only when implementation or measured production behavior differs from the approved design.

---

### Task 5: Final verification and publication

**Files:**
- Review all files changed since `origin/main`.

**Interfaces:**
- Consumes: Completed implementation and tests.
- Produces: A reviewed draft pull request targeting `main`.

- [ ] **Step 1: Run formatting and diff checks**

```bash
git diff --check
git status --short
```

- [ ] **Step 2: Run full backend verification**

```bash
pnpm run check:backend
```

Expected: all type checks and backend tests pass.

- [ ] **Step 3: Review the complete diff**

Compare `origin/main...HEAD`, resolve every critical or important review finding, and rerun affected tests.

- [ ] **Step 4: Commit intentionally**

Stage only the approved query, tests, migration, design, and plan files. Commit with a terse performance-fix description.

- [ ] **Step 5: Push and open a draft PR**

Push `agent/player-search-db-performance`, open a draft PR against `main`, and include root cause, production measurements, schema drift, behavior changes, and verification commands in the PR body.
