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

## Included results and finalisation

The first model includes only:

- singles rubbers;
- normal outcomes;
- results with two known, distinct canonical players;
- results with a non-tied game score; and
- records with `rubbers.played_at` or `fixtures.date_played`.

Walkovers, retirements, void results and doubles are excluded.

Tournament ratings are not changed from calendar or in-progress records. Fixtures and rubbers are
owned by the completed result record created by result ingestion, so they become eligible only
after the result event has been finalised and ingested. Every eligible match on one rating date is
calculated from the same pre-date state and the complete period is committed atomically. A failed
period therefore changes no player ratings, and a retry cannot apply a partial period twice.

## Rating state and leaderboard score

The model starts new players at rating 1500, rating deviation 350 and volatility 0.06. It uses
`tau = 0.5` and a volatility convergence tolerance of `0.000001`.

The API and player UI expose all three Glicko-2 state values:

- rating: the current ability estimate;
- rating deviation (RD): uncertainty in that estimate; and
- volatility (`σ`): how quickly the player's underlying strength is changing.

The public leaderboard orders players using:

```text
conservative_rating = rating - 2 * rating_deviation
```

A player is provisional while their rating deviation is above 110. There is no minimum rated-match
threshold for leaving provisional status.

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

## Current rank versus historical rating

A calculated rating is retained as historical evidence even when a player is no longer eligible
for a current rank. `rating_current_rankings` materialises the present-day leaderboard after each
rating run and during the weekly rating audit.

The default current-ranking policy requires:

- a match within the last 365 days;
- at least 5 unique opponents inside the model window;
- present-day rating deviation no greater than 110; and
- no unresolved critical player data issue.

There is no minimum rated-match requirement. RD is the Glicko-2 confidence gate; the activity,
opponent-network and data-quality checks remain separate safeguards for a meaningful current
leaderboard.

Present-day deviation is calculated from `last_rated_at`, stored volatility and elapsed inactive
days. This prevents a player who never returns from keeping an artificially low historical
deviation indefinitely.

The public endpoint defaults to the current active ranking:

```http
GET /api/ratings?ranking=active
```

The historical leaderboard remains available without applying current activity eligibility:

```http
GET /api/ratings?ranking=historical
```

Players who fail the current policy keep their calculated rating and historical rank. The rating
audit explains the exact exclusion reason through:

```http
GET /api/ratings/audit/ranking-quality
```

## Chronological backtesting laboratory

The backtesting command compares fixed history windows while keeping one out-of-sample evaluation
period constant. The default comparison uses 2, 3, 5 and 10 years of retained results and the most
recent 180 eligible match days.

```bash
pnpm --filter @tt-players/worker ratings:backtest
```

Optional controls:

```bash
pnpm --filter @tt-players/worker ratings:backtest -- --windows=2,5,10
pnpm --filter @tt-players/worker ratings:backtest -- --evaluation-days=365
pnpm --filter @tt-players/worker ratings:backtest -- --end-date=2026-07-31
pnpm --filter @tt-players/worker ratings:backtest -- --output-json=reports/backtest.json --output-html=reports/backtest.html
```

The replay prevents future leakage:

- every prediction uses rating state available before that match date;
- all matches on one date are predicted from the same pre-date state;
- same-day rating updates are applied simultaneously; and
- all windows use the shared `rating_rubber_classification` eligibility rules.

Each window reports Brier score, log loss, favourite accuracy, calibration error, cold-start count,
calibration buckets and its final top 25. Lower Brier score, log loss and calibration error are
better. Higher favourite accuracy is better.

The latest JSON snapshot is also persisted under
`source_quality_snapshots.key = rating-backtest:<model-key>`. The `Run rating backtest` GitHub
Action runs on the first day of every month at 05:41 UTC and supports manual inputs. It executes the
deployed worker on the VPS, uploads the JSON and standalone HTML reports as a 90-day artifact, and
writes the window comparison into the workflow summary.
