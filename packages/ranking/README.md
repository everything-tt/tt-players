# TT Players Ranking

Reusable player rating and ranking algorithms extracted from TT Players.

Published package: `@wudong/tt-players-ranking` on GitHub Packages.

## Scope

This package owns deterministic, persistence-free ranking logic only:

- Glicko-2 rating updates
- default rating state and model configuration
- inactivity-driven rating-deviation inflation
- conservative leaderboard scoring
- expected-score calculation
- per-match evidence attribution used by rating audits

Database queries, match eligibility, canonical player resolution, scheduling, history persistence, and audit storage remain in the TT Players applications. Keeping those concerns outside this package makes the algorithm reusable in workers, APIs, simulations, backtests, and other applications.

## Install from GitHub Packages

Configure the `@wudong` scope to use GitHub Packages:

```ini
@wudong:registry=https://npm.pkg.github.com
```

Then install:

```sh
pnpm add @wudong/tt-players-ranking
```

## Basic usage

```ts
import {
  conservativeRating,
  defaultRatingState,
  updateRating,
} from '@wudong/tt-players-ranking';

const before = defaultRatingState();
const after = updateRating(before, [
  {
    opponentRating: 1620,
    opponentDeviation: 90,
    score: 1,
  },
]);

console.log(after.rating);
console.log(conservativeRating(after));
```

## Same-period updates

Pass all observations from the same rating period to one `updateRating` call. The implementation is intentionally order-independent for observations within that period, so callers do not need to invent an ordering for matches played on the same day.

```ts
const after = updateRating(before, [
  { opponentRating: 1700, opponentDeviation: 70, score: 1 },
  { opponentRating: 1550, opponentDeviation: 90, score: 0 },
]);
```

## Inactivity

`inflateDeviationForInactivity` increases uncertainty according to elapsed inactive days and caps it at the configured initial deviation. TT Players currently treats 28 days as one inactivity period.

## Audit evidence

`calculateRatingMatchEvidence` exposes the same Glicko-2 terms used by the period update so an audit can explain expected win probability, surprise, information contribution, and an attributed rating delta. Attributed deltas across a period sum to the period rating change.

## Testing and compatibility

The package test suite includes:

- the worked example from the Glicko-2 paper
- same-period ordering invariance
- draws
- inactivity and uncertainty caps
- configurable conservative ranking scores
- expected-score behavior
- extreme numeric inputs
- deterministic upset evidence
- evidence attribution across multiple matches
- a packed-package consumer smoke test

TT Players keeps thin compatibility modules under `apps/worker/src/ratings/` so application orchestration can retain its existing imports while the implementation comes from this package.

## Publishing

The shared-package GitHub Actions workflow tests, builds, inspects, consumer-smoke-tests, and publishes this package to GitHub Packages on `main`. Bump `packages/ranking/package.json` before changing a version that has already been published.
