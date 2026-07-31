# Backend hardening history

This document records the backend hardening work completed on 31 July 2026, why each change was made, the resulting architecture, and the follow-up corrections identified by the post-merge review.

## Goals

The backend should remain simple, observable, and predictable while serving the public API and running ingestion work on the same VPS and PostgreSQL database.

The guiding rules are:

- user-facing API work has priority over scraping and background processing;
- expensive aggregation should not run on normal request paths;
- background work must be bounded, retryable, and idempotent;
- domain rules should have clear homes without introducing unnecessary service, repository, dependency-injection, or CQRS layers;
- the root quality gate must run every meaningful backend test;
- performance claims must be backed by reproducible measurements rather than intuition.

## Completed changes

### 1. API priority and resource budgets

The API and worker now use separate PostgreSQL connection budgets and timeouts. The API has the larger pool and shorter statement limits; the worker has a smaller data pool, a bounded Graphile Worker pool, single-job concurrency by default, and lower systemd CPU and I/O weights.

Unexpected API failures are logged internally but returned as a stable `Internal Server Error` response. Slow requests are logged, both processes close their pools on shutdown, and production systemd units define explicit relative priorities.

Why:

- unbounded background work could make public endpoints slow or unavailable;
- separate budgets make contention visible and controllable;
- safe error responses prevent implementation details leaking to clients;
- graceful shutdown reduces interrupted transactions and locked queue work.

### 2. Worker-maintained API read models

Three supporting structures were introduced:

- `data_versions` for cheap version and ETag values;
- `source_quality_snapshots` for the data-coverage dashboard;
- `player_active_leagues` for league-scoped ratings.

The source-quality endpoint now reads one prepared JSON snapshot instead of scanning the ingestion schema on every request. League ratings filter through compact active-league memberships rather than revisiting match history.

Why:

- source-quality aggregation joins and counts several large transactional tables;
- the same expensive result does not need to be recomputed for every visitor;
- active league membership changes with ingestion, not with each HTTP request;
- small read models keep API latency stable while leaving source-of-truth tables unchanged.

### 3. Bounded and deduplicated worker work

Long manual retry loops were removed in favour of Graphile Worker retries. Deterministic job keys were added. TT Leagues work was split into a lightweight fixture snapshot followed by bounded set-result batches, and player reconciliation was moved from every result batch to one daily pass.

Why:

- sleeping inside tasks occupies worker capacity and complicates shutdown;
- bounded batches prevent one division from monopolising the worker;
- deterministic keys reduce duplicate refresh work;
- global reconciliation is significantly cheaper once per ingestion cycle than once per batch.

### 4. Rating domain boundaries

Shared rating concepts now live in small focused modules:

- model key, rating confidence, rounding, presentation, and predictions;
- history range calculation and history-point presentation;
- shared response schemas.

SQL remains next to the routes that use it.

Why:

- duplicated calculations could drift between global, league, detail, prediction, and history endpoints;
- pure domain functions are easy to test;
- keeping route SQL local avoids a repository/service hierarchy that would add indirection without solving a current problem.

### 5. Truthful backend quality gate

The root command `pnpm run check:backend` now runs backend typechecking plus database, API, worker, and performance-tool tests. Integration tests cover authenticated sync, ratings API contracts, and the API read-model migration.

Why:

- the previous root test command did not represent the complete backend;
- worker tests must not silently pass when no tests are discovered;
- PostgreSQL-backed tests catch migration and SQL contract problems that mocks cannot.

### 6. Reproducible performance evidence

Two dependency-light tools were added:

- `scripts/benchmark-api.mjs` records status counts, failures, throughput, and latency percentiles;
- `scripts/capture-query-plans.mjs` records PostgreSQL plans and buffer summaries for representative endpoints.

The baseline runbook distinguishes engineering targets from measured results and describes idle and worker-active comparisons.

Why:

- performance changes need comparable evidence;
- production-shaped data and normal worker activity cannot be reproduced meaningfully in ordinary CI;
- raw JSON artifacts make later regressions auditable.

## Resulting backend shape

The intended flow after the completed work is:

```text
external sources
    -> bounded Graphile Worker scrape jobs
    -> staged raw payloads
    -> bounded parsing/loading jobs
    -> source-of-truth relational tables
    -> reconciliation and rating calculation
    -> worker-maintained API read models
    -> Fastify API
```

The API and worker share PostgreSQL but have separate application pools and system resource priorities. Migrations remain a deployment responsibility.

## Post-merge review findings

A complete review after all six changes were merged identified five related corrections suitable for one follow-up PR.

### A. Make the daily pipeline completion-gated

The existing schedule starts scraping, reconciliation, ratings, and read-model refresh at fixed times. A delayed or retried ingestion job can therefore finish after downstream stages have already run.

Correction:

- replace the independent downstream cron entries with a pipeline task;
- inspect the stable `graphile_worker.jobs` view once per polling interval;
- proceed only after the current ingestion window has no pending scrape or processing jobs;
- run reconciliation, ratings, and read-model refresh as explicit sequential stages;
- block and surface permanently failed current-window ingestion jobs rather than silently publishing incomplete derived data.

This keeps the existing Graphile Worker architecture and avoids adding a workflow framework or a second orchestration database model.

### B. Preserve successful match results when one item fails

The current set-result batch stores data only after all match fetches succeed. One malformed or persistently failing response can discard unrelated successful responses in the same batch.

Correction:

- use Graphile Worker's array-payload batch semantics;
- process each match as an independently settled promise while retaining sequential upstream requests;
- let Graphile Worker retry only failed payload entries;
- store and queue processing for successful match results immediately.

### C. State job-key behaviour explicitly

A deterministic key alone does not prevent a duplicate when the matching job is already locked under Graphile Worker's default `replace` mode.

Correction:

- use `unsafe_dedupe` only for idempotent latest-state scrape and processing jobs where a concurrent duplicate has no additional value;
- use explicit `replace` semantics for the staged daily-pipeline continuation, which intentionally schedules the next stage while the current stage is locked;
- document this distinction in code and tests.

### D. Correct league pagination totals

The league endpoint derives its total from the first paged row. An out-of-range page has no first row and incorrectly reports a total of zero.

Correction:

- return the count independently of the paged result rows;
- add an integration test for an empty out-of-range page.

### E. Keep CI and deployment gates aligned

Backend CI does not currently trigger for performance-tool-only changes, and the production deployment workflow still duplicates the old test commands.

Correction:

- add performance scripts and their tests to Backend CI path filters;
- make production deployment use `pnpm run check:backend`;
- remove the obsolete `--passWithNoTests` path.

## Validation expectations

The follow-up PR should pass:

```bash
pnpm run check:backend
bash -n scripts/deploy-vps-release.sh
bash -n scripts/rollback-vps-release.sh
```

It should include focused tests for:

- daily pipeline waiting, failure blocking, and stage progression;
- array-payload result isolation and failed-entry retry behaviour;
- explicit job-key modes;
- league totals on an empty page;
- workflow path and command changes through normal GitHub Actions execution.

## Deferred improvements

The review also identified useful later work that is intentionally outside this follow-up PR:

- make query-plan captures exactly match every production endpoint query;
- report successful, HTTP-error, and all-response latency separately;
- align player detail rank with the complete leaderboard tie ordering;
- move heavy startup recovery and read-model refresh behind the running queue;
- add optimistic concurrency to multi-device user sync;
- implement conditional `If-None-Match` handling for read-model endpoints.

These should be evaluated after the five correctness and quality-gate fixes above are merged and measured.