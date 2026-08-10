# Rating calculation audit trail

The v1 calculated-rating worker records immutable evidence for every calculation invocation without changing the `global-singles-glicko2-v1` rating or leaderboard formula.

## Audit layers

### Calculation run

`rating_calculation_runs` records the execution boundary:

- model key and version;
- start/completion timestamps and run status;
- source-data cutoff date;
- deployed code commit SHA;
- the resolved Glicko-2 parameters used by the worker;
- a deterministic input fingerprint over `rating_rubber_classification`; and
- processed period/match counts or a bounded failure message.

The production worker resolves the commit SHA from deployment metadata when it is not supplied explicitly.

### Player rating period

`rating_period_audits` stores one row per player and processed rating date with:

- rating, RD, volatility, conservative ranking score and rank before/after the period;
- rated matches in the period and in total;
- unique rated opponents through that date;
- provisional state before/after; and
- the combined rating delta for the date.

All eligible matches on one date still use the same pre-period state. The audit does not create an artificial within-day ordering.

### Match evidence

`rating_match_audits` stores one player-perspective row for each side of each included rubber. It records the opponent, result/game score, pre-period rating/RD, expected win probability, actual score, surprise value, attributed rating delta and information contribution.

For one observation, the attributed rating delta is the observation's contribution to the unchanged Glicko-2 period update:

```text
ratingScale * updatedPhi^2 * g(opponentRD) * (actual - expected)
```

The attributed deltas for all of a player's matches in a rating period sum to the player's combined rating delta. This makes same-day movement explainable without processing matches sequentially.

Excluded source rubbers are also written to `rating_match_audits` with `included = false` and an explicit reason from `rating_rubber_classification`. Reasons include a non-completed fixture, doubles, walkover, retirement, void result, missing dates or identities, same canonical player and tied score.

## Source of truth

The live calculator now reads eligible rubbers from the existing `rating_rubber_classification` view. That same view powers exclusion auditing and backtesting, so inclusion/exclusion semantics are defined once.

Changing a classification reason must not silently widen v1 eligibility: only `eligibility_reason = 'eligible'` is passed to Glicko-2.

## Reproducibility

The run input fingerprint is calculated from the ordered classification inputs that can affect eligibility or rating outcomes. Tests also verify that:

- deterministic match evidence is stable for identical inputs;
- same-day attributed deltas reconcile to the combined period update;
- included rubbers produce two player-perspective audit rows;
- excluded rubbers produce two excluded rows with a reason; and
- a full rebuild of the same model over unchanged data produces identical normalized run, period and match evidence.

Generated UUIDs and timestamps are execution metadata and are intentionally excluded from normalized reproducibility comparisons.

## Backfilling production history

Deploying the migration starts auditing new calculation runs, but it cannot infer historical before/after period states from the final `player_ratings` table alone.

After this schema is deployed, run the guarded **Rebuild calculated ratings** GitHub Action with the intended history scope to populate the historical period and included-match audit trail for already-published v1 ratings. Use the same maintenance-window precautions documented in `docs/ratings.md`.

The rebuild continues to use the existing v1 model identity, rating formula, provisional thresholds and same-day simultaneous updates. This audit work alone does not activate a v2 model or change production ranking behaviour.
