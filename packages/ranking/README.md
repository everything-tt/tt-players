# TT Players Ranking

Reusable player rating and ranking algorithms extracted from TT Players.

Published package: `@wudong/tt-players-ranking` on GitHub Packages.

## Scope

This package owns deterministic, persistence-free rating and ranking logic:

- Glicko-2 rating updates
- default rating state and model configuration
- inactivity-driven rating-deviation inflation
- conservative leaderboard scoring
- expected-score calculation
- per-match evidence attribution used by rating audits
- current-ranking eligibility policy and reason precedence
- present-day active-ranking score calculation
- deterministic current and historical rank ordering

Database queries, match-result eligibility, canonical player resolution, scheduling, history persistence, and audit storage remain in the TT Players applications. Keeping those concerns outside this package makes the algorithm reusable in workers, APIs, simulations, backtests, and other applications while allowing each application to provide its own persistence and evidence-loading layer.

## Install from GitHub Packages

GitHub Packages' npm registry requires authentication for package downloads, including public packages. Configure the `@wudong` scope and provide a token with package read access.

For local development, put this in `.npmrc`:

```ini
@wudong:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
always-auth=true
```

Set `GITHUB_PACKAGES_TOKEN` to a GitHub personal access token that can read packages. In GitHub Actions, use the workflow's `GITHUB_TOKEN` when the repository/package permissions allow it, for example by setting `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` after `actions/setup-node` configures `registry-url: https://npm.pkg.github.com` and `scope: @wudong`.

Then install:

```sh
pnpm add @wudong/tt-players-ranking
```

## Basic rating usage

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

## Current ranking contract

`evaluateCurrentRanking` and `rankCurrentPlayers` expose the persistence-free contract behind TT Players' current leaderboard. A caller supplies each player's rating state plus evidence that belongs to the application/data layer: rated-match count, unique-opponent count, inactive days, and whether a critical data issue exists.

The default policy mirrors TT Players v1:

- activity within 365 days
- at least 10 rated matches
- at least 5 unique opponents
- present-day rating deviation no greater than 110
- no unresolved critical data issue

Eligibility reasons are evaluated in the same order as production: critical data issue, insufficient matches, insufficient opponents, inactivity, high uncertainty, then ranked. Current ranks sort by inactivity-adjusted conservative score, rated matches, then player ID. Historical ranks sort by the stored-period conservative score, rated matches, then player ID.

```ts
import { rankCurrentPlayers } from '@wudong/tt-players-ranking';

const [player] = rankCurrentPlayers([
  {
    playerId: 'player-123',
    state: { rating: 1780, deviation: 68, volatility: 0.06 },
    ratedMatches: 42,
    uniqueOpponents: 21,
    daysInactive: 14,
  },
]);

console.log(player?.eligible);
console.log(player?.currentRank);
console.log(player?.historicalRank);
```

The worker remains responsible for loading those inputs efficiently from PostgreSQL and materialising the resulting leaderboard. Consumers that already have the evidence can use the package to reproduce the same pure ranking decisions without copying TT Players' ranking rules.

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
- current-ranking thresholds and eligibility precedence
- active/historical ranking and tie-break ordering
- a packed-package consumer smoke test that runs both TypeScript declaration checking and the installed JavaScript package

TT Players keeps thin compatibility modules under `apps/worker/src/ratings/` so application orchestration can retain its existing imports while the implementation comes from this package.

## Versioning and rating-model changes

Package SemVer and TT Players rating-model versions serve different purposes.

- Refactors, documentation changes, additional tests, and backward-compatible APIs may bump only the package version.
- A package release that changes the numerical rating result, inactivity semantics, ranking eligibility, or leaderboard ordering must not silently continue an existing production model such as `global-singles-glicko2-v1` from state produced by the old algorithm.
- Behaviour-changing releases require the normal TT Players model-change process: backtest the change, introduce or deliberately migrate to a new model version, and rebuild/replay the affected history before making it public.

This keeps persisted rating state reproducible even when the reusable package continues to evolve.

## Publishing

The shared-package GitHub Actions workflow tests, builds, inspects, consumer-smoke-tests, and publishes this package to GitHub Packages on `main`. Bump `packages/ranking/package.json` before changing a version that has already been published.
