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
- Inactivity uncertainty is calculated lazily when a player next appears. Elapsed inactive days
  are converted into fractional 28-day rating periods, and no daily rows are written for inactive
  players.
- The daily worker processes at most 31 match dates, limiting load on a small VPS.

Memory usage is therefore bounded by the busiest single match date rather than by the complete
multi-million-row rubber table.

## Included results and rating periods

The current model includes only:

- rubbers whose fixture status is `completed`;
- singles rubbers;
- normal outcomes;
- results with two known, distinct canonical players;
- results with a non-tied game score; and
- records with `rubbers.played_at` or `fixtures.date_played`.

Rubbers on upcoming or postponed fixtures, walkovers, retirements, void results and doubles are
excluded. Calendar records without persisted rubbers cannot affect a rating. Once result ingestion
persists an eligible rubber, it is available to the incremental calculator or historical replay.

Every eligible match on one rating date is calculated from the same pre-date state, and the whole
period is committed in one database transaction. A failed period therefore changes no player
ratings, and multiple same-day matches do not receive an invented ordering.

The live calculator, backtesting code and calculation audit share
`rating_rubber_classification` as the eligibility source of truth. See
[`rating-calculation-audit.md`](./rating-calculation-audit.md) for the persisted run, period,
per-match and exclusion evidence.

## Rating state and leaderboard score

The v1 model starts new players at rating 1500, rating deviation 350 and volatility 0.06. It uses
`tau = 0.5`, a volatility convergence tolerance of `0.000001`, and a 28-day inactivity period.
Inactive time is represented as fractional periods, so 14 inactive days add half a period of
uncertainty and 28 inactive days add one period.

The API and player UI expose all three Glicko-2 state values:

- rating: the current ability estimate;
- rating deviation (RD): uncertainty in that estimate; and
- volatility (`σ`): how quickly the player's underlying strength is changing.

The v1 public leaderboard orders players using:

```text
conservative_rating = rating - 2 * rating_deviation
```

A v1 rating is provisional while the player has fewer than 10 rated matches or their rating
deviation is above 110. These production thresholds and the ranking formula remain unchanged while
the alternatives proposed in issue #173 are evaluated through chronological backtesting.

## Weekly rating history

`player_rating_weekly_history` stores at most one row per model, player and ISO week. The row is
updated whenever another match date is processed in the same week, so it represents the latest
calculated rating for that week. Inactive weeks do not create placeholder rows.

The player profile reads this data from:

```http
GET /api/ratings/:playerId/history?range=1y
```

Supported ranges are `3m`, `1y`, `3y`, `10y` and `all`.

## Historical rebuilds

The normal rebuild command replaces the selected model's ratings, current rankings, replay
checkpoints and weekly history, then reuses the low-memory date-by-date processor.

Rebuild the default rolling ten-year window:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history
```

Rebuild a different rolling window or start date:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history -- --years=8
pnpm --filter @tt-players/worker ratings:rebuild-history -- --start-date=2018-01-01
pnpm --filter @tt-players/worker ratings:rebuild-history -- --model=global-singles-glicko2-v1
```

Rebuild every eligible result from the earliest available rating date:

```bash
pnpm --filter @tt-players/worker ratings:rebuild-history -- --all
```

`--all`, `--years` and `--start-date` are mutually exclusive scopes. Explicit invalid values fail
rather than silently falling back to defaults. The command emits a `RATING_REBUILD=...` JSON line
for automation and marks the processing state as failed if replay stops with an error.

A deployment that first introduces the calculation-audit schema needs one guarded rebuild over the
intended production history so historical before/after period states and included-match evidence
can be reconstructed. Merely deploying the schema can audit new runs and exclusions, but the final
`player_ratings` table alone cannot recreate past period states.

### Production GitHub Action

The manual **Rebuild calculated ratings** workflow provides the same three scopes:

- `all`: replay every eligible result;
- `years`: replay a rolling number of years; and
- `start-date`: replay from a supplied date.

The workflow requires the confirmation text `REBUILD_RATINGS`. It shares the VPS production
concurrency group with deployments, verifies that the compatible rebuild command is deployed,
stops the scheduled rating worker, runs the rebuild under the production worker account, refreshes
the audit snapshot and current-ranking read model, restarts the worker even after failure, verifies
production health, and stores the command log as an artifact.

Run a production rebuild during a maintenance window. The API remains online, but calculated-rating
responses can be incomplete while the derived tables are being replayed. The current ranking is
republished only after the final audit/read-model refresh.

## Historical corrections

The v1 checkpoint is forward-only during ordinary processing. If a rubber or fixture dated on or
before the committed `last_processed_date` is inserted or corrected later, use the historical
rebuild command so all later periods inside the chosen history window are replayed.

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

The default v1 current-ranking policy requires:

- a match within the last 365 days;
- at least 10 rated matches;
- at least 5 unique opponents inside the model window;
- present-day rating deviation no greater than 110; and
- no unresolved critical player data issue.

Present-day deviation is calculated from `last_rated_at`, stored volatility and elapsed inactive
days, using the same fractional 28-day periods as the historical calculator. This prevents a player
who never returns from keeping an artificially low historical deviation indefinitely without
penalising normal gaps between league matches as if every day were a complete Glicko period.

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
`source_quality_snapshots.key = rating-backtest:<model-key>`. The **Run rating backtest** GitHub
Action runs on the first day of every month at 05:41 UTC and supports manual inputs. It executes the
deployed worker on the VPS, uploads the JSON and standalone HTML reports as a 90-day artifact, and
writes the window comparison into the workflow summary.

## Issue #173 scope

The v1 model now has the first auditability foundation requested in issue #173: calculation-run,
player-period and per-match evidence, explicit exclusions, deterministic same-day attribution, and
reproducibility coverage. This phase deliberately leaves the current v1 rating and ranking policy
unchanged.

The following work remains separate:

- player-facing rating explanations and admin audit UI;
- configurable and side-by-side inactivity-period alternatives;
- alternative public ranking-score coefficients and ability/confidence presentation;
- broader newcomer calibration scenarios and historical distribution review;
- a side-by-side `global-singles-glicko2-v2` rollout backed by audit review and backtesting; and
- possible game-score weighting only after the auditable v1/v2 comparison is established.

Further rating-policy changes should continue to be validated through chronological backtesting and
reviewed before rollout.
