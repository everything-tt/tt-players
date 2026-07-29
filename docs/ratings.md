# Calculated player ratings

The calculated rating is a global singles Glicko-2 model derived from normal match results.
It is separate from imported official ranking/rating snapshots and from the existing form and
win-percentage leaderboards.

## Low-memory processing

The worker never loads the full match history or every player rating into memory.

- One match date is processed per database transaction.
- Only players active on that date and their current rating rows are loaded.
- Writes are split into batches (250 by default).
- `rating_processing_state.last_processed_date` is committed with the rating updates, so a
  stopped process resumes from the next date.
- Inactivity uncertainty is calculated lazily when a player next appears. No daily rows are
  written for inactive players.
- The daily worker processes at most 31 match dates, limiting load on a small VPS.

Memory usage is therefore bounded by the busiest single match date rather than by the complete
multi-million-row rubber table.

## Included results

The first model includes only:

- singles rubbers;
- normal outcomes;
- results with two known, distinct canonical players;
- results with a non-tied game score; and
- records with `rubbers.played_at` or `fixtures.date_played`.

Walkovers, retirements, void results and doubles are excluded.

## Rating and leaderboard score

The model starts new players at rating 1500, deviation 350 and volatility 0.06. The public
leaderboard orders players using:

```text
conservative_rating = rating - 2 * rating_deviation
```

A player is provisional while they have fewer than 10 rated matches or a deviation above 110.

## Running the backfill

After applying database migrations:

```bash
pnpm --filter @tt-players/worker ratings:calculate -- --rebuild
```

The command is resumable. Without `--rebuild`, it continues from the last committed match date.
To limit a manual run:

```bash
pnpm --filter @tt-players/worker ratings:calculate -- --max-periods=30
```

The normal worker also runs `calculateRatingsTask` daily at 04:00 UTC and processes up to 31
outstanding match dates.
