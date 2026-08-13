# Player interaction graph — Stage 1 internal analysis

Issue: #249

This is the first, deliberately offline phase of the player-interaction graph work. It is intended to answer one question before any product UI or persisted graph model is introduced:

> Does match-network community structure reveal useful playing pools beyond the league / competition / team metadata we already store?

## Scope

Stage 1 is read-only and exploratory.

It:

- loads recent singles rubbers from the existing relational database;
- resolves each source player to its canonical player identity;
- aggregates repeated opponents into weighted, time-aware edges;
- runs deterministic weighted modularity community detection;
- reports the largest communities and their dominant league / competition / team metadata;
- calculates bridge-player signals;
- reports the strongest cross-community connections;
- emits JSON for deeper inspection and Markdown for a human go/no-go review.

It does **not**:

- add graph tables or migrations;
- persist community membership;
- change ratings;
- expose graph scores through the API;
- add a force-directed graph or other UI;
- automatically decide that Stage 2 should proceed.

## Data included

The loader uses:

- singles rubbers only;
- `normal` and `retired` outcomes;
- non-deleted rubbers, fixtures, competitions, seasons, leagues and players;
- `rubber.played_at`, falling back to `fixture.date_played`;
- canonical player ids (`canonical_player_id`, falling back to the source player id);
- fixture home/away team metadata when available.

Walkovers and void rubbers are excluded because the initial graph is meant to model players who actually competed.

## Edge weighting

For each player pair, every match in the analysis window contributes:

```text
match_weight = exp(-ln(2) * age_days / half_life_days)
edge_weight  = sum(match_weight)
```

The default half-life is 180 days.

That means:

- a match on the analysis end date contributes `1.0`;
- a match 180 days earlier contributes `0.5`;
- a match 360 days earlier contributes `0.25`.

The JSON edge output also includes match count, wins, games won, latest match date, leagues and competitions represented.

## Community detection

The first implementation intentionally has no new graph-library dependency. It uses deterministic weighted modularity local moving, the core optimization step of Louvain-style community detection.

This is sufficient for the Stage 1 hypothesis test and keeps the experiment easy to run in the existing TypeScript worker. If the graph proves valuable, a later research comparison should run Leiden (for example with `igraph`) and measure assignment stability before community ids become persisted or user-facing.

Community ids are analysis-local labels such as `community-1`. They are not stable product identifiers.

## Bridge signal

For each player the analysis calculates:

- weighted degree;
- active opponent count;
- percentage of edge weight outside the player's community;
- participation coefficient across communities;
- bridge score.

The bridge score is:

```text
weighted_degree * participation_coefficient
```

This favors players who are both active and distribute meaningful match weight across multiple communities. It is an exploratory connector signal, not a player-strength metric.

## Run it

Set `DATABASE_URL` in the normal worker environment, then run:

```bash
pnpm --filter @tt-players/worker analysis:player-graph
```

Defaults:

```text
window             rolling 365 days ending today
recency half-life  180 days
minimum matches    1 per edge
minimum weight     0
JSON output        ./player-graph-analysis.json
Markdown output    ./player-graph-analysis.md
```

Example with an explicit historical cutoff:

```bash
pnpm --filter @tt-players/worker analysis:player-graph -- \
  --end-date=2026-08-13 \
  --window-days=365 \
  --half-life-days=180 \
  --output-json=artifacts/player-graph-2026-08-13.json \
  --output-markdown=artifacts/player-graph-2026-08-13.md
```

Optional noise filters:

```bash
--min-match-count=2
--min-edge-weight=0.5
```

Use those only as sensitivity checks. The first review should normally inspect the unpruned graph as well.

## What the report contains

The Markdown report highlights:

1. total matches, players, weighted edges, community count and modularity;
2. the largest 20 communities;
3. dominant league / competition / team shares for each community;
4. the highest bridge-player scores;
5. the strongest cross-community edge groups;
6. an explicit `REVIEW REQUIRED` gate before Stage 2.

The JSON report additionally contains every retained weighted edge and every active player's community membership/metrics.

## Stage 1 review

Inspect at least the largest ~20 communities and record examples in issue #249.

For each representative community, ask:

- Does it merely reproduce one known division/team?
- Does it combine multiple competitions in a way that reflects a real playing pool?
- Does it span leagues or tournament circuits credibly?
- Are apparent bridge players genuine cross-pool competitors?
- Are surprising cross-community edges real, or are they identity/ingestion problems?

Useful sensitivity checks:

- rolling 365 days, half-life 180;
- rolling 365 days, half-life 90;
- current-season-like cutoff/window where appropriate;
- minimum two matches per edge to see whether one-off tournament links dominate.

## Go / no-go rule

Proceed to Stage 2 only after a human review finds credible, non-trivial structure beyond metadata already available directly from league / competition / team relationships.

A **go** means there are useful emergent communities or connector patterns worth explaining on player profiles.

A **no-go / rethink** means detected communities mainly restate existing metadata, are unstable under reasonable weighting changes, or are dominated by data-quality artifacts.

The analysis code deliberately returns `review_required`; it does not turn a heuristic threshold into a product decision.
