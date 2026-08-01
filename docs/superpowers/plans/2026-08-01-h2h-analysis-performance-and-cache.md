# H2H Analysis Performance and Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce H2H analysis cache-miss cost and reuse analysis results safely across users and reversed player order.

**Architecture:** Resolve each selected player’s canonical identity and raw source IDs once, then filter `rubbers` directly by those indexed source IDs before canonicalising opponents. Compute recent form in one relevant-match pass and read latest/prior ratings with indexed lateral lookups. Store the normalized unordered-pair response in `cache_entries`, versioned by relevant match, identity, fixture and rating updates, with a one-hour fallback TTL.

**Tech Stack:** TypeScript, Fastify, Kysely raw SQL, PostgreSQL partial indexes, Vitest/Supertest, existing `cache_entries` table.

## Global Constraints

- Preserve the current H2H analysis response contract and evidence semantics.
- Correctness must be identical for canonical players and aliases.
- `A vs B` and `B vs A` must share one server-cache entry while returning correctly oriented values.
- Cache invalidation must include relevant rubbers, fixtures, player identities/opponent names and rating history.
- Do not add a duplicate rubbers index when migrations 007 and 011 already provide source-player partial indexes.

---

### Task 1: Cache and orientation regression coverage

**Files:**
- Modify: `apps/api/src/__tests__/h2h-correctness.test.ts`

- [ ] Register the existing cache and performance-index migrations in the focused H2H test database.
- [ ] Add a failing test proving reversed requests use one `h2h-analysis` cache row and return reversed players/edges.
- [ ] Add a failing test proving a relevant rubber update changes the cache source version.
- [ ] Run the focused test and confirm failure because the route does not yet cache analysis.

### Task 2: Indexed query path

**Files:**
- Modify: `apps/api/src/routes/h2h-analysis.ts`

- [ ] Resolve source IDs for both players in the identity query.
- [ ] Filter common-opponent and form rows directly by raw source-ID arrays.
- [ ] Canonicalise only opponent identities after relevant rubbers have been selected.
- [ ] Replace two recent-form branches with one relevant-match scan and two perspective rows where appropriate.
- [ ] Replace full-history window ranking with indexed latest/prior lateral lookups.
- [ ] Run the focused correctness test.

### Task 3: Data-versioned unordered-pair cache

**Files:**
- Modify: `apps/api/src/routes/h2h-analysis.ts`

- [ ] Normalize the two canonical player IDs for calculation and cache identity.
- [ ] Compute a source version from relevant rubbers/fixtures, involved player records and selected rating history.
- [ ] Read/write `cache_entries` with type `h2h-analysis`, query-parameter-aware key and one-hour TTL.
- [ ] Reverse cached output when request order differs from normalized order, including reasons.
- [ ] Run the focused test and full backend quality gate.

### Task 4: Query-plan capture

**Files:**
- Modify: `scripts/capture-query-plans.mjs`
- Modify: `scripts/__tests__/performance-tools.test.mjs`

- [ ] Add an H2H analysis relevant-rubbers plan using two high-activity players and the same indexed source-ID predicate.
- [ ] Keep the plan safely skipped when fewer than two usable players exist.
- [ ] Run performance-tool tests.

### Task 5: PR verification

- [ ] Open a focused pull request.
- [ ] Verify Backend CI passes.
- [ ] Compare `EXPLAIN (ANALYZE, BUFFERS)` output on the VPS before merge or in deployment review, recording execution time and buffer reads.
