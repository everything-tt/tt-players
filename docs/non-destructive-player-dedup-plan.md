# Non-Destructive Player Deduplication Plan

## Goal

Deduplicate players in the app without losing source-level player references.

The core change is: do not rewrite rubber player IDs during merge. Keep rubbers tied to the scraped `external_players` rows, and use `canonical_player_id` only as an app-level identity link.

## Core Invariant

After this change:

```text
external_players.id = source player/profile row
rubbers.*_player_id = original source player/profile ID
external_players.canonical_player_id = app identity group
API player_id = coalesce(canonical_player_id, id)
```

Never update these columns during merge:

```text
rubbers.home_player_1_id
rubbers.home_player_2_id
rubbers.away_player_1_id
rubbers.away_player_2_id
```

## Current Problem

Today a merge can:

1. Set alias player rows to point at a canonical player.
2. Rewrite `rubbers.home_player_1_id`, `away_player_1_id`, etc. to the canonical player.
3. Soft-delete alias player rows.

That makes the UI cleaner, but it destroys provenance. If a merge is wrong, we cannot easily know which rubbers originally belonged to which alias player.

There is also a second destructive path in the loader: it maps scraped players to `row.canonical_player_id ?? row.id` before writing rubbers. That means future ETL runs can keep writing canonical IDs into rubber columns even after the reconciler stops remapping.

## Target Model

```text
external_players
  = source-specific player records
  = one row per scraped profile/person reference

rubbers
  = source match facts
  = keep original source player IDs

canonical_player_id
  = app-level identity grouping
  = says which source player rows represent the same real person

API
  = canonicalized read layer
  = aggregates stats/search/leaders across linked source player rows
```

Example:

```text
TT Leagues Grace Liu
  id = A
  canonical_player_id = A

TT365 Grace Liu 351641
  id = B
  canonical_player_id = A

TT365 Grace Liu 379358
  id = C
  canonical_player_id = A

rubbers still point to B or C where originally scraped
API shows one Grace Liu by grouping A+B+C
```

## Implementation Steps

### 1. Fix Loader First

File: `apps/worker/src/loader.ts`

Current problem: loader maps scraped players to `row.canonical_player_id ?? row.id`, then writes those IDs into rubbers. This is destructive even if the reconciler is fixed.

Change both player maps to source IDs:

```ts
playerIdMap.set(row.external_id, row.id);
playerIdMap.set(`unnamed_${row.name}`, row.id);
```

Do not return or use `canonical_player_id` in loader player mapping.

Also verify TT365 processing paths use this loader and do not separately canonicalize player IDs.

### 2. Change Reconciler

File: `apps/worker/src/player-reconciler.ts`

Update `reconcilePlayersByName` so it only updates `external_players`.

Remove:

- all `rubbers` update statements
- `remappedRubbers` counting based on rubber updates
- alias soft delete behavior

New behavior:

- choose canonical ID as today
- set canonical row `canonical_player_id = canonicalId`
- set all alias rows `canonical_player_id = canonicalId`
- set linked rows `deleted_at = null`
- set linked rows `updated_at = now()`
- return `remappedRubbers: 0`, or rename the result field in a separate cleanup if desired

Keep ambiguous-name safeguards.

### 3. Add Shared API Identity Helpers

File: `apps/api/src/routes/players.ts`

Add helpers near the cache helpers:

```ts
async function resolveCanonicalPlayer(db, requestedId) {
  // Fetch requested player.
  // canonicalId = player.canonical_player_id ?? player.id.
  // Display row = canonical row if present and not deleted, else requested row.
}

async function resolveCanonicalSourceIds(db, requestedId) {
  // Return { canonicalId, playerName, sourceIds }.
  // sourceIds = all external_players where coalesce(canonical_player_id, id) = canonicalId.
  // Include deleted_at IS NULL once aliases are restored; consider not filtering during repair.
}
```

Prefer self-canonical semantics. Migration 006 initializes `canonical_player_id = id`, so unlinked players should normally have `canonical_player_id = id`.

### 4. Fix `/players/search`

File: `apps/api/src/routes/players.ts`

Return one row per canonical player.

Implementation shape:

- find active `external_players` matching `name ilike`
- compute `canonical_id = coalesce(ep.canonical_player_id, ep.id)`
- group by canonical ID
- display name should prefer canonical row name
- return `{ id: canonical_id, name }`

Important: if an alias name matches but canonical row name differs slightly, search should still return the canonical player.

### 5. Fix Basic Stats

File: `apps/api/src/routes/players.ts`

For `GET /players/:id/stats`:

- resolve source IDs for requested ID
- query rubbers where `home_player_1_id = any(sourceIds)` or `away_player_1_id = any(sourceIds)`
- win/loss checks must use `ANY(sourceIds)`, not raw `id`
- response `player_id` should be canonical ID
- response `player_name` should be canonical display name

### 6. Fix Extended Stats, Insights, Affiliations, and Rubbers

File: `apps/api/src/routes/players.ts`

Affected routes:

- `GET /players/:id/stats/extended`
- `GET /players/:id/insights`
- `GET /players/:id/affiliations/current-season`
- `GET /players/:id/rubbers`

For every player-side condition:

```sql
r.home_player_1_id = any(source_ids)
or r.away_player_1_id = any(source_ids)
or r.home_player_2_id = any(source_ids)
or r.away_player_2_id = any(source_ids)
```

For opponent grouping:

- join opponent `external_players`
- group by `coalesce(opponent_ep.canonical_player_id, opponent_ep.id)`
- display name from opponent canonical row where possible
- do not show multiple rows for linked opponent aliases

For result orientation:

- calculate whether the requested player group is on the home or away side using source ID membership

### 7. Fix Leaders

File: `apps/api/src/routes/players.ts`

Current leaders aggregate raw rubber player IDs.

New shape:

- in the `singles` CTE, join each rubber-side player to `external_players ep`
- select `coalesce(ep.canonical_player_id, ep.id) as player_id`
- aggregate by canonical `player_id`
- join canonical display row as `canonical_ep`
- filter deleted source rows carefully; aliases should remain active, so `ep.deleted_at IS NULL` is fine

This should produce one leaderboard row per real player identity.

### 8. Fix H2H

File: `apps/api/src/routes/players.ts`

For `GET /players/:id/h2h/:opponentId`:

- resolve source IDs for both requested players
- match rubbers where one group is home and the other group is away, in either direction
- compute `isWin` from requested player group perspective
- return opponent ID as opponent canonical ID
- preserve league filter behavior

### 9. Cache Invalidation

Current caches mostly version off `rubbers.updated_at`. Merge/unmerge changes `external_players.canonical_player_id`, so caches can go stale.

Update data version for affected cached endpoints to include identity changes:

```sql
greatest(
  max(rubbers updated/created timestamp),
  max(external_players.updated_at)
)
```

At minimum apply to:

- leaders cache
- extended stats cache
- insights cache
- possibly count cache if `/players/count` becomes canonical count

When merge/unmerge updates canonical links, set `updated_at = now()`.

### 10. Add Unmerge Script or Function

Add a small worker script or exported function, for example in `apps/worker/src/player-reconciler.ts`:

```ts
export async function unmergePlayer(db, aliasPlayerId: string) {
  await db
    .updateTable('external_players')
    .set({
      canonical_player_id: aliasPlayerId,
      deleted_at: null,
      updated_at: new Date(),
    })
    .where('id', '=', aliasPlayerId)
    .execute();
}
```

Prefer `canonical_player_id = id` over `null` because migration 006 initialized rows that way.

No rubber repair is needed for future non-destructive merges.

### 11. Historical Repair Strategy

Previous merges may already have rewritten rubber IDs. For those, unmerge cannot restore provenance by itself.

Recommended practical approach:

1. Ship non-destructive loader and reconciler first.
2. Restore soft-deleted aliases to active where needed.
3. Reprocess raw scrape logs or rescrape affected fixtures so loader rewrites rubbers from source data.
4. Use manual backup/source-log repair only for known bad historical cases that cannot be reprocessed.

## Tests To Add

Worker tests:

- reconciler links aliases but does not update any rubber player columns
- reconciler leaves aliases active with `deleted_at = null`
- loader writes source `external_players.id` to rubbers even when `canonical_player_id` points elsewhere
- unmerge sets alias `canonical_player_id = alias.id` and leaves rubbers unchanged

API tests:

- search returns one canonical result for linked aliases
- stats include rubbers from all linked source rows
- unmerged alias stops contributing to previous canonical player
- leaders aggregate linked aliases into one row
- H2H works when either player has multiple source IDs
- recent rubbers/rivals/insights group opponents by canonical ID
- cache changes after merge/unmerge because `external_players.updated_at` participates in data version

## Implementation Order

1. Loader source-ID fix
2. Reconciler non-destructive merge
3. Identity helper functions
4. Search/basic stats
5. Leaders
6. H2H/rubbers/extended/insights/affiliations
7. Cache versions
8. Unmerge function/script
9. Historical repair/reprocess tooling
10. Full test run: `pnpm test`
