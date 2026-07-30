# Official ranking and rating history

TT Players imports Table Tennis England's published Sport:80 ranking and rating lists. These official snapshots remain separate from the app's calculated global Glicko-2 ability rating.

## Public snapshot layer

The Sport:80 discovery and parsing tables remain in the worker-only staging schema. Every imported row is also normalized into `official_ranking_snapshots` in the public schema so it can be replicated and served safely by the read-only API.

Each public snapshot preserves:

- source provider and source player;
- ranking category and category external ID;
- period label, source period ID and period end date;
- whether the row came from the official ranking or rating list;
- published rank and points;
- county or country;
- inactive-period count and initial-rating flag.

Migration 033 backfills all existing Sport:80 staging history. Future ranking jobs upsert both the staging evidence and the public snapshot in an idempotent way.

## Canonical player lookup

Official snapshots remain attached to their original Sport:80 player rows. The API resolves all source player rows linked to the requested canonical player, so a confirmed identity link makes the official history visible on the combined player profile without rewriting source provenance.

## API

`GET /api/ratings/:playerId/official-history`

Optional query parameters:

- `list_kind=all|ranking|rating`, default `all`;
- `limit=1..500`, default `100`.

The response contains:

- `latest`: the most recent snapshot for each provider, category and list kind;
- `history`: the requested chronological snapshot rows.

## Player profile

The player profile shows an **Official TTE Lists** section below **Ability Rating**. The explanatory copy makes clear that the official Sport:80 lists are published snapshots and are not the calculated Glicko-2 estimate. Players with no imported official rows do not see an empty section.
