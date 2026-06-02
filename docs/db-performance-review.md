# Database & Backend Performance Review

**Generated:** 2026-06-01  
**Scope:** Schema, indexes, query patterns, page-to-query mapping

---

## Executive Summary

The codebase has **13 tables**, **11 dedicated performance indexes** (migration 007), and a **cache_entries** table for expensive aggregations. The schema is well-designed for an ETL pipeline with proper deduplication constraints and soft deletes. However, several API routes have **significant performance risks** that will degrade as data grows.

**Severity scale used below:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 1. Schema & Index Review

### 1.1 Entity-Relationship Map

```
platforms ──< leagues ──< seasons ──< competitions ──< teams
                                            │                │
                                            │                └── league_standings
                                            └── fixtures ──< rubbers ──> external_players

leagues ──< league_regions >── regions
```

### 1.2 Existing Indexes

| Index | Table | Columns | Type | Partial WHERE |
|-------|-------|---------|------|---------------|
| `uq_external_players_platform_external` | external_players | (platform_id, external_id) | Unique B-tree | `external_id IS NOT NULL` |
| `idx_external_players_name_trgm_active` | external_players | (name) | GIN trigram | `deleted_at IS NULL` |
| `idx_external_players_canonical_player_id` | external_players | (canonical_player_id) | B-tree | — |
| `idx_fixtures_home_team_date_active` | fixtures | (home_team_id, date_played DESC, id) | B-tree | `deleted_at IS NULL` |
| `idx_fixtures_away_team_date_active` | fixtures | (away_team_id, date_played DESC, id) | B-tree | `deleted_at IS NULL` |
| `idx_rubbers_home_p1_fixture_singles_active` | rubbers | (home_player_1_id, fixture_id) | B-tree | singles, non-null, non-walkover |
| `idx_rubbers_away_p1_fixture_singles_active` | rubbers | (away_player_1_id, fixture_id) | B-tree | singles, non-null, non-walkover |
| `idx_rubbers_h2h_p1_pair_fixture_active` | rubbers | (home_player_1_id, away_player_1_id, fixture_id) | B-tree | singles, non-null |
| `idx_rubbers_home_p2_fixture_doubles_active` | rubbers | (home_player_2_id, fixture_id) | B-tree | doubles, non-null, non-walkover |
| `idx_rubbers_away_p2_fixture_doubles_active` | rubbers | (away_player_2_id, fixture_id) | B-tree | doubles, non-null, non-walkover |
| `idx_rubbers_fixture_created_active` | rubbers | (fixture_id, created_at) | B-tree | `deleted_at IS NULL` |
| `idx_league_standings_team_updated_active` | league_standings | (team_id, updated_at DESC) | B-tree | `deleted_at IS NULL` |
| `idx_league_standings_team_created_active` | league_standings | (team_id, created_at DESC) | B-tree | `deleted_at IS NULL` |
| `idx_raw_scrape_logs_payload_hash` | raw_scrape_logs | (payload_hash) | B-tree | — |
| `uq_cache_entries_type_key` | cache_entries | (type, cache_key) | Unique B-tree | — |
| `idx_cache_entries_expires_at` | cache_entries | (expires_at) | B-tree | — |

### 1.3 Missing Indexes

| Table | Missing Index | Impact | Severity |
|-------|---------------|--------|----------|
| `rubbers` | `(home_player_1_id)` bare for simple existence checks | The partial composite index only covers specific WHERE patterns | 🟡 Medium |
| `rubbers` | `(away_player_1_id)` bare for simple existence checks | Same as above | 🟡 Medium |
| `rubbers` | `(home_player_2_id, away_player_2_id, fixture_id)` for doubles H2H | Doubles partner queries do full scans on player_2 columns | 🟡 Medium |
| `fixtures` | `(competition_id, date_played)` | League browse page joins fixtures through competitions | 🟡 Medium |
| `league_standings` | `(competition_id)` with `deleted_at IS NULL` | Standings queries filter by competition_id with no index | 🟠 High |
| `competitions` | `(season_id)` with `deleted_at IS NULL` | Multiple routes traverse season → competitions hierarchy | 🟡 Medium |
| `seasons` | `(league_id, is_active)` where `deleted_at IS NULL` | League listing filters on is_active and joins from league_id | 🟡 Medium |
| `teams` | `(competition_id)` with `deleted_at IS NULL` | Team lookups by competition currently PK-only | 🟢 Low |
| `external_players` | `(deleted_at)` partial or included in queries | COUNT(*) on external_players scans all rows | 🟡 Medium |

---

## 2. Page-by-Page Query Analysis

### 2.1 Home Page

| Query | Endpoint | Complexity | Est. Rows Scanned | Issues |
|-------|----------|------------|-------------------|--------|
| Leaderboard (combined) | `GET /players/leaders?mode=combined` | 🔴 Very High | Full `rubbers` + `fixtures` + `competitions` + `seasons` + `external_players` | See §3.1 |
| Player count | `GET /players/count` | 🟡 Medium | Full `external_players` + full `rubbers` | COUNT(*) on entire tables |

**Issues:**
- 🔴 **`/players/leaders` is the most expensive query in the system.** It scans the entire `rubbers` table (both home and away sides via UNION ALL), joins through 4 tables, aggregates in a CTE, then sorts in-memory. No caching. No LIMIT pushed into the CTE — it aggregates ALL players first, then truncates in JS.
- 🟡 **`/players/count` does two full-table COUNT(*) queries** with no caching. On a table with 100k+ rubbers this becomes slow.

**Recommendations:**
1. **Cache `/players/leaders`** in `cache_entries` with a 30-min TTL (same pattern as `/players/:id/insights`). Data changes only when the ETL runs.
2. **Push `min_played` filter into the CTE** with a `HAVING COUNT(*) >= min_played` before joining `external_players`.
3. **Materialize player stats** into a `player_stats_summary` table, refreshed by the worker after each scrape. Eliminates all runtime aggregation.
4. **Cache `/players/count`** — this data changes infrequently.

---

### 2.2 Player Profile Page

| Query | Endpoint | Complexity | Est. Rows Scanned | Issues |
|-------|----------|------------|-------------------|--------|
| Extended stats | `GET /players/:id/stats/extended` | 🔴 High | 5 separate DB round-trips per request | See §3.2 |
| Current affiliations | `GET /players/:id/affiliations/current-season` | 🟡 Medium | CTE with UNION ALL scanning rubbers | Moderate |
| Recent rubbers | `GET /players/:id/rubbers?limit=10&offset=0` | 🟡 Medium | COUNT + paginated SELECT with 6 JOINs | Two queries per request |
| Player insights | `GET /players/:id/insights` | 🟠 High (cached) | Full career scan on cache miss | See §3.3 |

**Issues:**
- 🔴 **`/stats/extended` fires 5 sequential DB queries** per request: (1) player lookup, (2) wins/losses/total, (3) nemesis CTE, (4) duo CTE, (5) streak, (6) most-played opponents. These are not parallelized and have no caching.
- 🟡 **`/rubbers` makes 2 DB round-trips** (COUNT + SELECT) when it could use a window function or return total from a separate materialized source.
- 🟡 **`/affiliations/current-season`** uses a UNION ALL of 4 rubbers player columns × 2 sides (home/away), which is 4 sub-queries effectively.

**Recommendations:**
1. **Parallelize the 5 queries in `/stats/extended`** with `Promise.all()` — they are independent. This alone cuts latency by ~4×.
2. **Add caching to `/stats/extended`** using the same `cache_entries` pattern as insights.
3. **Combine COUNT + SELECT** in `/rubbers` using a CTE with `COUNT(*) OVER()` window function to get total in one query.
4. Consider materializing affiliations since they change only when the ETL runs.

---

### 2.3 Player Matches Page (Paginated)

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| Paginated rubbers | `GET /players/:id/rubbers?limit=N&offset=M` | 🟡 Medium | OFFSET-based pagination degrades at high offsets |
| Player name lookup | `GET /players/:id/stats/extended` | 🟠 High | Re-fetches extended stats just for the name |

**Issues:**
- 🟡 **OFFSET pagination** on `rubbers` ordered by `f.date_played DESC` — at offset 500+ the DB still scans and discards rows.
- 🟠 **Player name fetched via full `/stats/extended`** instead of a lightweight player lookup query.

**Recommendations:**
1. **Switch to keyset/cursor pagination** using `(date_played, r.id)` as cursor: `WHERE (f.date_played, r.id) < (cursor_date, cursor_id) ORDER BY f.date_played DESC, r.id DESC LIMIT N`.
2. **Add a lightweight `GET /players/:id` endpoint** that returns just name/basic info.

---

### 2.4 Player Insights Page

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| Full insights | `GET /players/:id/insights` | 🟠 High (cached 30 min) | See §3.3 |
| Extended stats | `GET /players/:id/stats/extended` | 🔴 High | Redundant with insights data |

**Issues:**
- 🔴 **Insights fetches the player's ENTIRE career of singles matches** (all rows) and processes them in JavaScript. A player with 1000+ rubbers means 1000+ rows transferred and processed.
- 🟡 **Both insights and extended stats are fetched** on the insights page — significant data overlap.
- 🟢 **Caching is well-implemented** with `cache_entries` using data versioning (max updated_at of rubbers/fixtures).

**Recommendations:**
1. **Move aggregation into SQL** — the JS-side aggregation (by year, month, league, division, score patterns, rivals, home/away) can all be done with `GROUP BY` queries, dramatically reducing transferred rows.
2. **Combine insights + extended stats** into a single endpoint to avoid double computation.
3. **Consider pre-aggregating into a `player_season_stats` table** during ETL.

---

### 2.5 Head-to-Head Page

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| H2H matches | `GET /players/:id/h2h/:opponentId` | 🟢 Low-Medium | Good index coverage |

**Issues:**
- 🟢 **Well-indexed** — the `idx_rubbers_h2h_p1_pair_fixture_active` partial index covers the exact query pattern `(home_player_1_id, away_player_1_id)`.
- 🟡 **The query also checks the reverse pair** `(opponentId, id)` which the index handles via OR.
- 🟡 **No LIMIT** — returns all encounters between two players (usually small, but unbounded).

**Recommendation:**
- Minor: add a reasonable LIMIT (e.g., 200) as a safety cap.

---

### 2.6 Team Page

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| Team summary | `GET /teams/:id/summary` | 🟢 Low | 4 LEFT JOINs, PK lookup |
| Team form | `GET /teams/:id/form` | 🟡 Medium | 2 queries: standings + recent fixtures |
| Team roster | `GET /teams/:id/roster` | 🟠 High | Full scan of fixtures + rubbers for team | See §3.4 |
| Team fixtures | `GET /teams/:id/fixtures` | 🟡 Medium | 3 CTEs, well-structured | Good pagination |

**Issues:**
- 🟠 **`/teams/:id/roster` is expensive** — it joins `fixtures` → `rubbers` → `external_players` with complex OR conditions on all 4 player columns. The JOIN condition `(f.home_team_id = ${id} AND (r.home_player_1_id = ep.id OR r.home_player_2_id = ep.id)) OR (f.away_team_id = ${id} AND ...)` is effectively a cross-product filter that defeats index usage.
- 🟡 **`/teams/:id/form` makes 2 sequential queries** that could be parallelized.
- 🟢 **Fixtures query is well-designed** with CTEs for paged fixtures + score aggregation.

**Recommendations:**
1. **Rewrite roster query** to first get fixture IDs for the team (indexed), then join rubbers, then join players. Break the mega-OR into stages.
2. **Add caching to roster** — roster data changes only when ETL runs.
3. **Parallelize the 2 queries in `/form`** with `Promise.all()`.

---

### 2.7 Leagues Page

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| All leagues | `GET /leagues` | 🟡 Medium | Joins 4 tables, no pagination |
| Standings | `GET /competitions/:id/standings` | 🟢 Low | Small result set per competition |
| League regions | Second query in `/leagues` | 🟢 Low | IN-list lookup |

**Issues:**
- 🟡 **`/leagues` returns ALL active leagues with ALL divisions** — no pagination, no caching. As more leagues are added, this grows unbounded.
- 🟡 **Missing index on `competitions(season_id)`** — the standings query joins `league_standings` by competition_id, but competition lookup by season_id has no index.

**Recommendations:**
1. **Cache `/leagues`** response — active leagues rarely change.
2. **Add index** on `competitions(season_id) WHERE deleted_at IS NULL`.
3. Consider **lazy-loading divisions** per league rather than returning everything.

---

### 2.8 Player Search

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| Search | `GET /players/search?q=name` | 🟡 Medium | 5 LEFT JOINs + aggregation per search |
| Recent players | `GET /players/search` (no query) | 🟠 High | Recent 100-day filter + aggregation |

**Issues:**
- 🟡 **Every search triggers a full aggregation pipeline** — LEFT JOIN through rubbers → fixtures → competitions → seasons, GROUP BY player, ORDER BY stats. The trigram index helps with name matching but doesn't reduce the join cost.
- 🟠 **Recent players (no query)** is particularly expensive — it joins all 5 tables, filters by date, aggregates, sorts, and returns top 10. This runs on every search sheet open with empty query.
- 🟡 **SQL injection risk** — `ilike '%${normalizedQuery}%'` uses string interpolation inside the Kysely `sql` template, but since Kysely's `sql` tag does parameterize, this is safe. However, the pattern is fragile.

**Recommendations:**
1. **Pre-compute player stats** into a `player_search_materialized` table refreshed after ETL. Search becomes a simple `SELECT` from this table.
2. **Cache the "recent players" result** — it changes slowly.
3. For name search, consider **searching against a pre-computed table** instead of joining and aggregating at query time.

---

### 2.9 Fixture Page

| Query | Endpoint | Complexity | Issues |
|-------|----------|------------|--------|
| Fixture detail | `GET /fixtures/:id/rubbers` | 🟢 Low-Medium | Well-indexed |

**Issues:**
- 🟢 First query looks up fixture + teams (PK-based, well-indexed).
- 🟢 Second query fetches rubbers by fixture_id (indexed via `idx_rubbers_fixture_created_active`).
- 🟡 4 LEFT JOINs for player names on rubbers — acceptable for a single fixture (typically 6–10 rubbers).

**Recommendation:**
- None needed. This is one of the best-performing routes.

---

## 3. Deep-Dive on Critical Queries

### 3.1 `/players/leaders` — The Most Expensive Route 🔴

```
CTE singles → UNION ALL (home + away sides)
  → scans ALL rubbers with 3 JOINs each
CTE aggregated → GROUP BY player_id
Main query → JOIN external_players, compute win_rate
JS → sort + filter + truncate to LIMIT
```

**Problems:**
1. **Full table scan of rubbers** — the partial indexes `(home_player_1_id, fixture_id) WHERE is_doubles = false AND outcome_type != 'walkover'` help the planner, but the UNION ALL still needs to scan all qualifying rows.
2. **No query-time filtering** — the CTE aggregates ALL players first, then JS filters by min_played and truncates to LIMIT. The DB does work proportional to ALL players, not just the top N.
3. **No caching** — every request re-aggregates from scratch.
4. **String split in SQL** — `string_to_array(${leagueCsv}, ',')` prevents prepared statement caching.

**Optimization path (ordered by impact):**

| Step | Change | Expected Impact |
|------|--------|-----------------|
| 1 | Cache in `cache_entries` with 30-min TTL | Eliminates 99%+ of DB hits |
| 2 | Add `HAVING COUNT(*) >= min_played` to CTE | Reduces aggregation output |
| 3 | Materialize `player_stats_summary` table | Eliminates runtime aggregation entirely |
| 4 | Use `ANY($1::uuid[])` instead of `string_to_array` | Better prepared statement reuse |

### 3.2 `/players/:id/stats/extended` — 5 Sequential Round-Trips 🔴

```
Query 1: SELECT player (PK lookup)          ~1ms
Query 2: COUNT(*) FILTER on rubbers          ~10-50ms
Query 3: Nemesis CTE (all opponents)         ~20-100ms
Query 4: Duo CTE (all doubles partners)      ~10-50ms
Query 5: Streak (last 10 results)            ~5-20ms
Query 6: Most played opponents               ~20-100ms
─────────────────────────────────────────────────
Total: 6 sequential queries                  ~66-321ms
```

**Optimization path:**

| Step | Change | Expected Impact |
|------|--------|-----------------|
| 1 | `Promise.all()` for queries 2–6 | Cut wall-clock by ~5× |
| 2 | Cache result in `cache_entries` | Near-zero for repeated views |
| 3 | Combine into single query with CTEs | Fewer round-trips |
| 4 | Pre-compute into materialized table | Eliminates runtime work |

### 3.3 `/players/:id/insights` — Full Career Download 🟠

```
Query 1: Player lookup (PK)                    ~1ms
Query 2: Data version check (MAX of updated_at) ~10ms
Query 3: Cache check                            ~1ms
  ─── cache miss path ───
Query 4: ALL singles matches (full career)      ~50-500ms
Query 5: ALL doubles matches                    ~10-50ms
  ─── JS processing ───
  → Aggregate by year, month, league, division, score, rival, home/away
  → ~500-2000 lines of JS for what SQL GROUP BY does natively
  ─── cache write ───
Query 6: UPSERT cache entry                     ~5ms
```

**Key insight:** The cache effectively mitigates this for repeat views (30-min TTL, data-version-aware). The problem is **cache miss penalty** — for a player with 1000 rubbers, the DB returns 1000+ rows that are then processed in JS.

**Optimization path:**

| Step | Change | Expected Impact |
|------|--------|-----------------|
| 1 | Move aggregation to SQL GROUP BY queries | Reduce rows transferred from 1000→~50 |
| 2 | Increase cache TTL to 2 hours | Fewer cache misses |
| 3 | Pre-warm cache during ETL | Eliminate user-facing cache misses |
| 4 | Materialize `player_insights` table | Zero runtime computation |

### 3.4 `/teams/:id/roster` — Complex OR Join 🟠

```sql
FROM fixtures f
JOIN rubbers r ON r.fixture_id = f.id
JOIN external_players ep ON (
    (f.home_team_id = $1 AND (r.home_player_1_id = ep.id OR r.home_player_2_id = ep.id))
    OR
    (f.away_team_id = $1 AND (r.away_player_1_id = ep.id OR r.away_player_2_id = ep.id))
)
```

**Problems:**
1. The JOIN condition is a 4-way OR that **cannot use any single index efficiently**.
2. PostgreSQL may choose a nested loop with poor index selectivity.
3. No caching — runs fresh on every page load.

**Optimization path:**

| Step | Change | Expected Impact |
|------|--------|-----------------|
| 1 | Rewrite as 4 UNION ALL sub-queries, each with clean index access | Better index usage |
| 2 | Cache in `cache_entries` | Eliminates repeat queries |
| 3 | Pre-compute `team_roster` table during ETL | Zero runtime work |

---

## 4. Cross-Cutting Performance Issues

### 4.1 Sequential Query Patterns 🔴

Several routes fire multiple DB queries **sequentially** when they could be parallelized:

| Route | Sequential Queries | Fix |
|-------|-------------------|-----|
| `GET /players/:id/stats/extended` | 6 sequential queries | `Promise.all()` |
| `GET /teams/:id/form` | 2 sequential queries | `Promise.all()` |
| `GET /players/count` | 2 sequential (already Promise.all ✅) | — |

### 4.2 No Response Compression

No evidence of HTTP compression (gzip/brotli) middleware. JSON responses with repeated string fields (league names, division names) compress very well — typically 70-80% size reduction.

### 4.3 No HTTP Caching Headers

No `Cache-Control`, `ETag`, or `Last-Modified` headers on any response. Even with server-side caching, the client re-fetches on every navigation.

### 4.4 N+1 Pattern in Data Availability Checks

`resolveTeamDataAvailability()` is called conditionally in team routes. While it's a single query, it runs after the main query completes (sequential).

### 4.5 `deleted_at IS NULL` on Every Query

Every route filters `WHERE deleted_at IS NULL`. This is correct but means the DB must check this column on every scan. The partial indexes in migration 007 help, but several tables (notably `seasons`, `competitions`, `teams`) lack partial indexes for their common access patterns.

### 4.6 No Connection Pooling Configuration Visible

No evidence of explicit `pg` / Kysely connection pool tuning (`max`, `idleTimeoutMillis`, etc.). Default pool size (10) may be insufficient under concurrent load.

---

## 5. Frontend Caching Review

### 5.1 TanStack Query Usage

| Page | Uses TanStack Query | Cache Strategy |
|------|-------------------|---------------|
| Home | ✅ | Default staleTime (0 = always refetch) |
| Player Profile | ✅ | Default staleTime |
| Player Matches | ❌ (manual fetch) | No caching |
| Player Insights | ❌ (manual fetch) | No caching |
| H2H | ❌ (manual fetch) | No caching |
| Player Search | ❌ (manual fetch) | No caching (correct for search) |
| Team Page | ✅ | Default staleTime |
| Leagues | ✅ | Default staleTime |
| Fixture | ✅ | Default staleTime |

### 5.2 Issues

1. **Default `staleTime` is 0** — TanStack Query refetches on every window focus. For data that only changes during ETL runs (which happen on a schedule), this causes unnecessary API calls.
2. **Manual fetch pages** (Matches, Insights, H2H) implement no caching at all — navigating away and back triggers a fresh API call.
3. **No shared query client configuration** for `staleTime` / `cacheTime`.

**Recommendations:**
- Set `staleTime: 5 * 60 * 1000` (5 minutes) globally on the QueryClient.
- Set `staleTime: 30 * 60 * 1000` (30 minutes) for static data (leagues, standings, team summary).
- Convert manual fetch pages to use TanStack Query hooks for automatic caching.

---

## 6. Missing Database Features

### 6.1 Materialized Views / Summary Tables

The biggest performance win would be **pre-computed summary tables**:

```sql
-- Example: player_stats_summary (refreshed after ETL)
CREATE TABLE player_stats_summary (
    player_id     UUID PRIMARY KEY REFERENCES external_players(id),
    singles_played  INT NOT NULL DEFAULT 0,
    singles_wins    INT NOT NULL DEFAULT 0,
    doubles_played  INT NOT NULL DEFAULT 0,
    doubles_wins    INT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This would eliminate runtime aggregation for: `/leaders`, `/search`, `/:id/stats`, `/:id/stats/extended`.

### 6.2 No `updated_at` Index on Fixtures

The insights cache uses `MAX(r.updated_at, r.created_at, f.updated_at, f.created_at)` as a data version. No index supports this max computation efficiently.

### 6.3 No `EXPLAIN ANALYZE` Baseline

No evidence of query performance testing. Without baselines, it's impossible to measure whether optimizations help.

---

## 7. Priority-Ranked Recommendations

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Cache `/players/leaders` response in `cache_entries` | 🔴 Eliminates most expensive uncached query | Low |
| **P0** | Parallelize queries in `/players/:id/stats/extended` with `Promise.all()` | 🔴 5× latency reduction | Low |
| **P1** | Add caching to `/players/:id/stats/extended` | 🟠 Eliminates 6-query routes for repeat views | Low |
| **P1** | Rewrite `/teams/:id/roster` query (split OR into UNION ALL) | 🟠 Better index utilization | Medium |
| **P1** | Add missing index `league_standings(competition_id) WHERE deleted_at IS NULL` | 🟠 Standings queries | Low |
| **P1** | Set TanStack Query `staleTime` to 5–30 minutes globally | 🟠 Reduces unnecessary API calls | Low |
| **P2** | Add HTTP `Cache-Control` headers to API responses | 🟡 Client-side caching | Low |
| **P2** | Add HTTP compression middleware (fastify-compress) | 🟡 70-80% response size reduction | Low |
| **P2** | Switch `/players/:id/rubbers` to cursor-based pagination | 🟡 Consistent perf at high offsets | Medium |
| **P2** | Add `competitions(season_id)` index | 🟡 Better league hierarchy joins | Low |
| **P2** | Convert manual-fetch pages to TanStack Query hooks | 🟡 Eliminates redundant fetches | Medium |
| **P3** | Create `player_stats_summary` materialized table | 🟡 Eliminates all runtime aggregation | High |
| **P3** | Move insights aggregation from JS to SQL GROUP BY | 🟡 Reduces data transfer | High |
| **P3** | Pre-warm player insights cache during ETL | 🟢 Eliminates user-facing cache misses | Medium |
| **P3** | Add `EXPLAIN ANALYZE` to test suite for regression detection | 🟢 Prevents performance regressions | Medium |

---

## 8. Quick Wins (Can Be Done Today)

These changes require minimal code and provide immediate benefit:

### 8.1 Parallelize Extended Stats Queries
```typescript
// Before: 6 sequential awaits
const player = await ...;
const { wins, losses, total } = await ...;
const nemesisRes = await ...;
const duoRes = await ...;
const streakRes = await ...;
const mostPlayedRes = await ...;

// After: parallelize after player lookup
const player = await ...;
if (!player) return 404;
const [{ wins, losses, total }, nemesisRes, duoRes, streakRes, mostPlayedRes] = 
    await Promise.all([statsQuery, nemesisQuery, duoQuery, streakQuery, mostPlayedQuery]);
```

### 8.2 Add Index on `league_standings.competition_id`
```sql
CREATE INDEX idx_league_standings_competition_active 
ON league_standings (competition_id) 
WHERE deleted_at IS NULL;
```

### 8.3 Set Global staleTime on QueryClient
```typescript
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
        },
    },
});
```

### 8.4 Add fastify-compress
```typescript
import compress from '@fastify/compress';
app.register(compress);
```

---

*End of report.*
