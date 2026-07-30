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

## Weekly rating history

`player_rating_weekly_history` stores at most one row per model, player and ISO week. The row is
updated whenever another match date is processed in the same week, so it represents the latest
calculated rating for that week. Inactive weeks do not create placeholder rows.

The player profile reads this data from:

```http
GET /api/ratings/:playerId/history?range=1y
```

Supported ranges are `3m`, `1y`, `3y`, `10y` and `all`.

## Ten-year history rebuild

After applying database migrations, rebuild the current model and weekly history from a rolling
ten-year cutoff:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history
```

The default cutoff is the Monday of the ISO week containing the date ten calendar years ago.
Matches before that cutoff are not replayed. Current ratings and weekly history are therefore both
based on the same ten-year window.

Optional overrides:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history -- --years=8
pnpm --filter @tt-players/worker ratings:rebuild-history -- --start-date=2018-01-01
pnpm --filter @tt-players/worker ratings:rebuild-history -- --model=global-singles-glicko2-v1
```

The command clears the selected model's current ratings and weekly snapshots, sets the processing
checkpoint to the day before the cutoff, and then reuses the normal low-memory date-by-date
processor. It is safe to restart: after the reset has committed, the normal calculation checkpoint
continues from the last completed date.

## Historical corrections

The v1 checkpoint is forward-only. If a rubber or fixture dated on or before the committed
`last_processed_date` is inserted or corrected later, rerun the ten-year history rebuild so all
later periods inside the supported history window are replayed:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history
```

A complete all-archive rebuild remains available when deliberately required:

```bash
pnpm --filter @tt-players/worker ratings:calculate -- --rebuild
```

## Running the normal processor

Without a rebuild, the calculator continues from the last committed match date:

```bash
pnpm --filter @tt-players/worker ratings:calculate
```

To limit a manual run:

```bash
pnpm --filter @tt-players/worker ratings:calculate -- --max-periods=30
```

The normal worker also runs `calculateRatingsTask` daily at 04:00 UTC and processes up to 31
outstanding match dates. Weekly history is maintained automatically by the database trigger during
those normal incremental updates.
