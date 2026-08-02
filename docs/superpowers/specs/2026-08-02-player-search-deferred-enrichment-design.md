# Deferred Player Search Enrichment Design

## Problem

Production player-name searches currently wait for match-stat aggregation before returning the first page. Even after the page-first rewrite, uncached searches for common names take roughly 4–5 seconds. The user needs the matching names immediately; wins and matches played are secondary information.

## Decision

Split player discovery into two independent requests:

1. return the matching canonical player names and IDs immediately;
2. enrich the currently visible IDs with `played` and `wins` after the name result set is stable.

This is an additive trial. Existing `/api/players/search` behaviour remains available while the mobile Players page moves to the new two-stage flow.

## Goals

- Show the first page of matching player names without querying `rubbers`.
- Preserve stable alphabetical pagination and the total match count.
- Request enrichment once per visible result set, not once per player.
- Never block navigation or name rendering on enrichment.
- Ignore or cancel enrichment belonging to an obsolete search query.
- Measure name-search and enrichment latency independently in CI and production.

## Non-goals

- Redesign player profile pages.
- Change leaderboard, saved-only, blank-search, or league-scoped legacy query behaviour.
- Introduce a new persisted read model in this iteration.
- Guarantee that enrichment is sub-second before measuring its production query plan.

## API design

### Name search

`GET /api/players/search/names?q=<query>&limit=<n>&offset=<n>`

Response:

```json
{
  "data": [
    { "id": "uuid", "name": "Player name" }
  ],
  "total": 858,
  "limit": 10,
  "offset": 0,
  "has_more": true
}
```

The query:

- resolves canonical players from matching active aliases;
- orders by `name, id`;
- applies `LIMIT` and `OFFSET`;
- uses `COUNT(*) OVER()` for the total;
- does not join `rubbers`, `fixtures`, `competitions`, or `seasons`.

The endpoint accepts only active global name search in this trial. It requires a non-empty query and retains the existing maximum page size.

### Batch enrichment

`GET /api/players/enrichment?ids=<uuid,uuid,...>`

Response:

```json
{
  "data": [
    { "id": "uuid", "played": 42, "wins": 26 }
  ]
}
```

Rules:

- accept at most 50 unique canonical player IDs;
- return one row for every requested active player, using zero counts where that player has no eligible singles;
- omit IDs that do not identify an active canonical player;
- exclude doubles, deleted records, and walkovers consistently with the existing search statistics;
- preserve canonical/alias aggregation;
- use one database request for the complete batch;
- sort and deduplicate IDs before sending the request so equivalent visible sets share a cache key;
- set dynamic public cache headers.

The implementation must compare indexed query shapes for the ten-ID case rather than copying the current slow search CTE without measurement. Candidate shapes include a bounded source-ID relation with indexed home/away scans and per-player lateral aggregates.

## Mobile data flow

1. `useSearch` continues to debounce the typed query and enforce the three-character minimum.
2. `usePlayerList` requests the names endpoint and renders its page immediately.
3. A separate React Query request starts when the current debounced query has a successful names page and its visible ID list is non-empty.
4. The enrichment query key includes the normalized query and sorted unresolved visible IDs.
5. React Query aborts the request when the query or visible IDs change.
6. The UI merges enrichment by player ID without reordering or replacing the name rows.
7. Loading more names triggers enrichment for newly visible unresolved IDs; already enriched IDs are retained.

No additional timer is required after the existing search debounce. A completed names response for the current debounced query defines a stable result set.

## UI behaviour

- Name, avatar, navigation, and favourite action appear as soon as name search completes.
- Before enrichment, the subtitle area uses a quiet fixed-height placeholder so rows do not jump.
- After enrichment, the subtitle becomes `26W · 42P`.
- Enrichment failure removes the loading placeholder and leaves the name-only row usable; it does not replace the list with an error state.
- Name-search failure continues to use the existing retryable list error state.
- Late enrichment from an old query must never update the current results.

Search results use a dedicated type with nullable enrichment rather than pretending missing statistics are zero. `FavouritePlayer.played` and `FavouritePlayer.wins` become optional for backward-compatible storage. Newly followed name-only results persist `id` and `name`; following-list rows omit the subtitle until statistics are available. Existing stored favourites with numeric statistics remain valid.

## Error handling

- Invalid or excessive enrichment IDs return HTTP 400.
- Missing or deleted IDs are omitted from the batch response.
- Database errors return the existing generic HTTP 500 response.
- Client cancellation is silent.
- Enrichment retry is handled by React Query and must not block the row.

## Testing

### API

- Name search returns correct canonical IDs, stable pagination, and total count.
- Query-shape guard proves the name endpoint contains no `rubbers` access.
- Enrichment returns correct wins/played values for aliases and canonical players.
- Enrichment excludes doubles and walkovers.
- Enrichment returns zeros for active players without eligible singles.
- Enrichment validates the ID limit, deduplicates repeated IDs, and omits inactive IDs.

### Mobile

- Names render before enrichment resolves.
- Subtitles populate without changing order.
- Changing the query prevents stale enrichment from appearing.
- An enrichment failure leaves rows navigable and followable.
- Infinite loading enriches only unresolved visible IDs.
- Name-only favourites persist and render without fake zero statistics.

## Performance validation

Use the original production cases `Green` and `Hannah`.

Acceptance targets for the direct production API after deployment:

- name-search p95 below 1 second, with no `rubbers` access;
- no search request reaches the database statement timeout;
- enrichment for 10 IDs is measured separately and does not delay name rendering;
- target enrichment p95 below 1 second, but a slower enrichment result does not block shipping the two-stage UX if correctness and name latency pass;
- record `EXPLAIN (ANALYZE, BUFFERS)` for the selected enrichment query and compare it with the current combined route.

## Rollout

- Implement the additive endpoints and move only the mobile global-search flow to them.
- Keep the current combined endpoint during the trial for rollback and compatibility.
- Benchmark controlled and live production latency after deployment.
- If the UX is successful, remove the combined global-name path in a later cleanup or retain it only for legacy callers.
