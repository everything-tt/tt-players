# Player interaction graph — Stage 1 internal analysis

Issue: #249

This is the first, deliberately offline phase of the player-interaction graph work. It answers one question before any product UI or persisted graph model is introduced:

> Does match-network community structure reveal useful playing pools beyond the league / competition / team metadata we already store?

## Scope

Stage 1 is read-only and exploratory. It builds canonical singles-player edges from existing match history, detects weighted communities, reports dominant league / competition / team metadata, surfaces bridge players and cross-community connections, and emits JSON plus Markdown for human review.

It does **not** add graph tables, persist community membership, change ratings, expose graph scores through the API, add graph UI, or automatically decide that Stage 2 should proceed.

## Data included

The loader uses:

- singles rubbers only;
- `normal` and `retired` outcomes;
- non-deleted rubbers, fixtures, competitions, seasons, leagues and players;
- `rubber.played_at`, falling back to `fixture.date_played`;
- canonical player ids (`canonical_player_id`, falling back to the source player id);
- fixture home/away team metadata when available.

Walkovers and void rubbers are excluded because the initial graph is intended to model players who actually competed.

## Default time model

Stage 1 now deliberately uses a broader historical view:

```text
window             rolling 1095 days (about 3 years)
recency half-life  730 days (about 2 years)
```

With the default half-life, approximate match weights are:

```text
today     1.00
1 year    0.71
2 years   0.50
3 years   0.35
```

The aim is to preserve occasional tournament, cross-league and bridge relationships while still favouring current activity.

For each player pair:

```text
match_weight = exp(-ln(2) * age_days / half_life_days)
edge_weight  = sum(match_weight)
```

The JSON edge output also includes match count, wins, games won, latest match date, leagues and competitions represented.

## No-decay comparison

Stage 1 also supports an explicit historical baseline:

```bash
pnpm --filter @tt-players/worker analysis:player-graph -- --no-decay
```

In this mode every retained match contributes `1.0` to its edge. The report records `decayMode: "none"` and the Markdown report states that recency decay is disabled.

`--no-decay` and `--half-life-days=...` are mutually exclusive.

This baseline is useful because Stage 1 should compare whether communities and bridge players are stable when recency weighting is removed, rather than silently assuming one decay rate is correct.

## Community detection

The first implementation intentionally has no new graph-library dependency. It uses deterministic weighted modularity local moving, the core optimization step of Louvain-style community detection.

This is sufficient for the Stage 1 hypothesis test and keeps the experiment easy to run in the existing TypeScript worker. If the graph proves valuable, a later research comparison should run Leiden (for example with `igraph`) and measure assignment stability before community ids become persisted or user-facing.

Community ids are analysis-local labels such as `community-1`. They are not stable product identifiers.

## Bridge signal

For each player the analysis calculates weighted degree, active opponent count, percentage of edge weight outside the player's community, participation coefficient across communities, and bridge score.

```text
bridge_score = weighted_degree * participation_coefficient
```

This favors players who are both active and distribute meaningful match weight across multiple communities. It is an exploratory connector signal, not a player-strength metric.

## Run it

Set `DATABASE_URL` in the normal worker environment, then run:

```bash
pnpm --filter @tt-players/worker analysis:player-graph
```

Defaults:

```text
window             rolling 1095 days ending today
recency half-life  730 days
minimum matches    1 per edge
minimum weight     0
JSON output        ./player-graph-analysis.json
Markdown output    ./player-graph-analysis.md
```

Example with an explicit historical cutoff:

```bash
pnpm --filter @tt-players/worker analysis:player-graph -- \
  --end-date=2026-08-13 \
  --window-days=1095 \
  --half-life-days=730 \
  --output-json=artifacts/player-graph-2026-08-13.json \
  --output-markdown=artifacts/player-graph-2026-08-13.md
```

Optional noise filters:

```bash
--min-match-count=2
--min-edge-weight=0.5
```

Use those only as sensitivity checks. The first review should normally inspect the unpruned graph as well.

## Stage 1 sensitivity runs

The recommended comparison is:

```text
A. 1095-day window, no decay
   historical competitive ecosystem

B. 1095-day window, 730-day half-life
   mild recency weighting — default

C. 1095-day window, 365-day half-life
   more current competitive structure
```

Commands:

```bash
pnpm --filter @tt-players/worker analysis:player-graph -- --no-decay

pnpm --filter @tt-players/worker analysis:player-graph -- \
  --window-days=1095 --half-life-days=730

pnpm --filter @tt-players/worker analysis:player-graph -- \
  --window-days=1095 --half-life-days=365
```

The important question is not which setting produces the nicest-looking communities. Inspect which communities and bridge relationships remain credible and stable across reasonable weighting choices, and which appear only because of older history.

## What the report contains

The Markdown report highlights total matches, players, weighted edges, community count and modularity; the largest 20 communities; dominant league / competition / team shares; highest bridge-player scores; strongest cross-community edge groups; and an explicit `REVIEW REQUIRED` gate before Stage 2.

The JSON report additionally contains every retained weighted edge, every active player's community membership/metrics, and the run configuration used for the analysis.

## Stage 1 review

Inspect at least the largest ~20 communities and record examples in issue #249.

For each representative community, ask:

- Does it merely reproduce one known division/team?
- Does it combine multiple competitions in a way that reflects a real playing pool?
- Does it span leagues or tournament circuits credibly?
- Are apparent bridge players genuine cross-pool competitors?
- Are surprising cross-community edges real, or are they identity/ingestion problems?
- Does the structure remain credible across no-decay, 730-day and 365-day decay runs?

## Go / no-go rule

Proceed to Stage 2 only after human review finds credible, non-trivial structure beyond metadata already available directly from league / competition / team relationships.

A **go** means there are useful emergent communities or connector patterns worth explaining on player profiles.

A **no-go / rethink** means detected communities mainly restate existing metadata, are unstable under reasonable weighting changes, or are dominated by data-quality artifacts.

The analysis code deliberately returns `review_required`; it does not turn a heuristic threshold into a product decision.
