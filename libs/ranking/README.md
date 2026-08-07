# TT Players Ranking

Dependency-free TypeScript helpers for the player rating model used by TT Players.

The package owns the deterministic algorithm layer only. Database reads/writes, match selection, persisted model policy, job scheduling, audit persistence, and leaderboard materialization remain application concerns.

## Published package

The release workflow publishes this library to GitHub Packages as:

```text
@wudong/tt-players-ranking
```

Configure npm/pnpm for the `@wudong` scope and install the package from `https://npm.pkg.github.com`.

## API

```ts
import {
  DEFAULT_GLICKO2_CONFIG,
  calculateRatingMatchEvidence,
  conservativeRating,
  defaultRatingState,
  inflateDeviationForInactivity,
  updateRating,
} from '@wudong/tt-players-ranking';
```

The public API includes:

- the TT Players Glicko-2 defaults and model types;
- default state creation;
- Glicko-2 period updates for win/loss/draw observations;
- inactivity-driven rating-deviation inflation;
- conservative leaderboard score calculation; and
- deterministic per-match evidence attribution used by rating audits.

## Rating-period semantics

Call `updateRating` once for all observations in a rating period. TT Players uses a calendar day as a period, which means matches on the same day are evaluated from the same pre-period state rather than inventing an ordering between them.

Inactivity inflation is expressed as fractional periods (28 days by default) and is capped at the initial rating deviation.

## Testing

The package test suite covers the official Glicko-2 worked example, win/loss/draw behavior, inactivity, conservative scores, custom model parameters, evidence attribution, and a packed-package consumer smoke test.
