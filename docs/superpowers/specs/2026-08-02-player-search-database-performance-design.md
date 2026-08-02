# Player Search Database Performance Design

## Goal

Make player search consistently fast on the production data set while preserving canonical identity, pagination, activity filtering, match statistics, and ordering. Repair the production index drift without mutating an already-applied migration.

## Scope

This change covers the `/api/players/search` query family and the six indexes that are present in the repository's historical migration source but absent from production. It also aligns API validation with the mobile client's existing three-character minimum for text search.

Player-page request consolidation, connection-pool sizing, PostgreSQL telemetry, and leaderboard read models remain separate follow-up work.

## Query Architecture

Player search has two execution strategies because its ordering requirements differ by mode.

### Candidate-first search

Named searches and saved-player searches first resolve the matching canonical players, page or restrict that candidate set where semantics permit, expand source identities through `external_players.canonical_player_id`, and then aggregate rubbers only for those sources. The direct canonical join is valid because migration 006 initialized every source to itself and migration 038 plus its triggers preserve a non-null, one-hop canonical root.

When league filters are present, candidate matches are checked against scoped fixtures before pagination so inactive candidates are excluded without changing totals. Match statistics remain limited to the requested leagues.

### Fixture-first recent browse

Blank browse is ordered by recent activity, so it cannot page names before calculating activity. It first materializes active fixtures from the last 100 days, then materializes their rubbers through a lateral fixture-id lookup. The lookup includes an optimization barrier so PostgreSQL cannot flatten the query and reorder it into a full-table rubber scan. Home and away appearances are combined before a single canonical-player join. This preserves the current `played DESC`, `wins DESC`, `name`, `id` ordering while restricting work to recent fixtures.

### Validation

An omitted or whitespace-only `q` remains valid for blank and saved-player modes. A non-empty text query shorter than three trimmed characters returns HTTP 400. This matches the current mobile search contract and prevents broad one-character production scans.

## Schema Repair

Add a new forward migration after migration 038. It creates the six missing indexes with `IF NOT EXISTS`:

- `idx_rubbers_home_p1_fixture_updated_active`
- `idx_rubbers_away_p1_fixture_updated_active`
- `idx_rubbers_home_p2_fixture_updated_active`
- `idx_rubbers_away_p2_fixture_updated_active`
- `idx_fixtures_id_updated_active`
- `idx_external_players_updated_at_active`

Fresh databases already receive these names from migration 022, making the repair migration a no-op there. Existing production databases receive the missing definitions. Migration 022 is left unchanged.

## Correctness and Testing

Integration tests cover canonical aliases, saved-only search, league-filtered search, blank recent ordering, pagination totals, and short-query rejection. A query-shape test requires the direct `canonical_player_id` expansion and prevents reintroduction of the `COALESCE` join that caused the production cardinality error.

Migration tests verify that a database representing the old migration-022 state receives all six indexes and that a fresh full migration chain remains valid.

Production-shaped verification uses read-only `EXPLAIN (ANALYZE, BUFFERS)` with representative unique and common names. The blank-browse plan must show fixture-keyed rubber index scans rather than a sequential scan over all rubbers. No production schema changes are part of PR verification.

## Operational Safety

The application query change is backward-compatible at the response level. Index creation is idempotent, but building the four rubber indexes over approximately 2.7 million rows may consume I/O and briefly affect writes; deployment should monitor the migration and worker services. The API's existing statement and lock timeouts remain unchanged.
