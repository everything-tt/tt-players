# Scraping Task System

This document describes how scraping is scheduled, executed, retried, and recovered in the worker service.

## 1. Overview

The scraping pipeline is task-based and runs on Graphile Worker (Postgres-backed queue).

Primary phases:
- Phase 1 (`Extract`): fetch upstream payloads and store raw responses in `raw_scrape_logs`.
- Phase 2 (`Transform + Load`): parse stored payloads and upsert normalized data.

Core task entries:
- `scheduleScrapeTasks` in `apps/worker/src/worker.ts`
- `scrapeUrlTask` in `apps/worker/src/tasks/scrapeUrlTask.ts`
- `scrapeMatchesTask` in `apps/worker/src/tasks/scrapeMatchesTask.ts`
- `processLogTask` in `apps/worker/src/tasks/processLogTask.ts`

## 2. Queue + Data Model

Queue tables:
- `graphile_worker.jobs` (view)
- `graphile_worker._private_jobs` / `_private_tasks` (internal tables)

Staging table:
- `raw_scrape_logs` stores upstream raw payloads (`endpoint_url`, `raw_payload`, `payload_hash`, `status`)
- `UNIQUE(endpoint_url, payload_hash)` provides content-level dedup

Status values:
- `pending`: extracted but not transformed
- `processed`: transformed successfully (or intentionally skipped)
- `failed`: transform could not complete

## 3. Startup Sequence

Both long-running and one-off runs call startup recovery before queueing new work.

Entry points:
- `pnpm --filter @tt-players/worker worker:start`
- `pnpm --filter @tt-players/worker worker:scrape`

Startup order:
1. Run Graphile migrations.
2. Run startup recovery (`apps/worker/src/startup-recovery.ts`).
3. Bootstrap league/season/competition records from config.
4. Queue initial scrape jobs.
5. Process queue.

## 4. Task Graph

Normal scheduled run (`worker:start`):
- Cron triggers `scheduleScrapeTasks` daily (UTC 02:00).
- Only active targets are queued.
- For TT365: queue standings + fixtures.
- For TT Leagues: queue standings + `scrapeMatchesTask`.

One-off run (`worker:scrape`):
- Optional history inclusion (`SCRAPE_INCLUDE_HISTORY=1`).
- Applies historical cooldown unless overridden.
- Queues same task types as above.
- Processes queue until empty or no runnable jobs remain.

Chaining behavior:
- `scrapeUrlTask` always queues `processLogTask`.
- `scrapeMatchesTask` stores bundled matches+sets payload and queues `processLogTask` with `platformType='ttleagues-bundle'`.
- `processLogTask` may queue additional `scrapeUrlTask` jobs for TT365 fixture/matchcard/playerstats expansion.

## 5. Platform Flows

### 5.1 TT Leagues

Standings path:
- `scrapeUrlTask` fetches standings JSON endpoint.
- `processLogTask` parses and loads standings rows.

Matches path:
- `scrapeMatchesTask` fetches division matches JSON.
- Fetches per-match sets only for missing/stale completed fixtures.
- Bundles `{ standings: [], matches, sets }` into one raw log row.
- `processLogTask` parses bundled payload and loads fixtures/rubbers/players.

### 5.2 TT365

Standings path:
- `scrapeUrlTask` fetches standings HTML.
- `processLogTask` parses standings and loads teams/standings.

Fixtures expansion path:
- `scrapeUrlTask` fetches fixtures HTML.
- `processLogTask` extracts match-card URLs.
- Refresh policy:
  - active season: recheck by fixture status age window
  - historical season: one-off snapshot by default
  - force refresh available via env flags

Match card path:
- `scrapeUrlTask` for `tt365DataType='matchcard'` performs two-step extraction:
  - GET match page
  - POST TT365 Ajax endpoint using anti-forgery token/cookies
- `processLogTask` parses match card and loads fixture/rubbers/players.
- Then extracts player statistics URLs and queues `playerstats` jobs.

Player stats path:
- `scrapeUrlTask` fetches player stats HTML.
- `processLogTask` parses rows for the target match and updates singles rubber scores.
- This is used as score source-of-truth for TT365 singles results.

## 6. Deduplication and Idempotency

Raw payload dedup:
- `extractor.storeScrapePayload` upserts on `(endpoint_url, payload_hash)`.
- If payload unchanged, only `scraped_at` updates.

Queue dedup:
- Some jobs use `jobKey` to avoid duplicate enqueues.
- Example: TT365 playerstats jobs use `tt365-playerstats:<competitionId>:<seasonToken>:<playerExternalId>`.

Load idempotency:
- All target tables use UPSERT with natural unique keys.
- `loadTTLeaguesData` runs in a single transaction.

## 7. Retry Model

Local in-task retry (fast transient handling):
- `scrapeUrlTask`: one immediate retry after `SCRAPE_RETRY_DELAY_MS` (default `10000ms`)
- `scrapeMatchesTask`: same one-retry behavior for matches endpoint

Queue-level attempts:
- Scrape fan-out jobs are typically enqueued with `maxAttempts: 1`.
- This avoids long in-queue backoff waits on paid CI runners.

Implication:
- A hard failure does not keep the run alive for hours.
- Re-attempts happen on later starts via explicit recovery/requeue policy.

## 8. Startup Recovery

Implemented in `apps/worker/src/startup-recovery.ts`.

Recovery actions:
1. Unlock stale workers:
- Finds locks older than `SCRAPE_STALE_LOCK_MINUTES` (default `20`).
- Calls `graphile_worker.force_unlock_workers(worker_ids)`.

2. Requeue transient TT365 scrape failures:
- Resets exhausted `scrapeUrlTask` rows where:
  - `payload.platformType == 'tt365'`
  - `last_error` matches transient HTTP class: `429/500/502/503/504`
- Batch limit: `SCRAPE_TRANSIENT_RETRY_BATCH_LIMIT` (default `300`).

3. Emit startup metrics logs:
- stale workers/jobs unlocked
- transient jobs requeued
- queue before/after summary

Feature switch:
- `SCRAPE_STARTUP_RECOVERY_ENABLED=0` disables recovery.

Daily pipeline coordination:
- Daily runs keep a per-run key such as `daily-pipeline:<run date>` so the
  audit history remains traceable by day.
- A database-backed `daily` active-run lease allows only one daily pipeline
  run to execute at a time. A newer run waits while another run has a fresh
  heartbeat instead of replacing its continuation.
- Every run carries a lease-owner token, and a PostgreSQL advisory lock covers
  each complete stage execution. A stale or duplicate task therefore cannot
  overlap reconciliation, rating, or read-model writes with its replacement.
- The lease is refreshed by the pipeline audit heartbeat and may be claimed
  by a newer run only after `DAILY_PIPELINE_STALE_RUN_MS` (default `6h`) has
  elapsed. This handles worker termination without silently running two
  pipelines concurrently.
- The monitor reports terminal queue failures as either current-day failures
  or historical failures using the job's latest activity time. A historical
  job retried and exhausted again today is therefore active again. Historical
  exhausted rows remain available for investigation and are not treated as
  active backlog.

## 9. Operational Controls (Env Vars)

General:
- `SCRAPE_RETRY_DELAY_MS` (default `10000`)

One-off scrape:
- `SCRAPE_INCLUDE_HISTORY=1` include discovered history
- `SCRAPE_HISTORY_COOLDOWN_DAYS` (default `180`)
- `SCRAPE_WAIT_FOR_DEFERRED_RETRIES=1` wait for future `run_at` jobs

TT365 refresh overrides:
- `TT365_FORCE_FIXTURES_REFRESH=1`
- `TT365_FORCE_PLAYER_STATS_REFRESH=1`
- `TT365_PLAYER_STATS_RECHECK_MS` (default `12h`)

Startup recovery:
- `SCRAPE_STARTUP_RECOVERY_ENABLED` (default enabled)
- `SCRAPE_STALE_LOCK_MINUTES` (default `20`)
- `SCRAPE_TRANSIENT_RETRY_BATCH_LIMIT` (default `300`)

Daily pipeline coordination:
- `DAILY_PIPELINE_STALE_RUN_MS` (default `6h`)

## 10. Common Failure Modes

Observed in production-like runs:
- TT365 historical matchcard URLs returning `HTTP 500` repeatedly.
- TT365 player stats URLs returning `HTTP 404` for legacy profiles.
- Interrupted runs leaving stale job locks.

Behavior with current system:
- Stale locks are recovered automatically at startup.
- Transient 5xx/429 exhausted jobs are retried in batches at startup.
- 404 failures are not auto-retried by recovery (treated as non-transient).

## 11. Quick Runbook

Check queue health:
- `select count(*) ... from graphile_worker.jobs` with runnable/deferred/exhausted filters.

Start worker:
- `pnpm --filter @tt-players/worker worker:start`

Run one-off:
- `pnpm --filter @tt-players/worker worker:scrape`

If queue appears stuck with runnable jobs:
- verify stale locks (`locked_by`, `locked_at`) in `graphile_worker.jobs`
- restart worker (startup recovery will unlock stale workers)

If only exhausted jobs remain:
- transient TT365 failures will be requeued automatically on next startup (batch-capped)
- non-transient failures (for example `404`) require manual decision (ignore, map URL changes, or targeted reset)

## 12. Player Identity Reconciliation

Player identity merge logic lives in:
- `apps/worker/src/player-reconciler.ts` (`reconcilePlayersByName`)

When it runs automatically:
- During TT Leagues bundled transform path (`platformType='ttleagues-bundle'`) inside `processLogTask`.

Manual execution:
- `pnpm --filter @tt-players/worker exec tsx -e "import { db } from '@tt-players/db'; import { reconcilePlayersByName } from './src/player-reconciler.ts'; (async()=>{ const r=await reconcilePlayersByName(db, { info: console.log }); console.log(r); await db.destroy(); })();"`

What it does:
- Links high-confidence cross-platform duplicates by exact normalized full-name match.
- Sets `canonical_player_id` across linked rows.
- Remaps rubber player references to canonical IDs.
- Soft-deletes alias `external_players` rows to avoid duplicate API results.

Latest manual run note:
- 2026-03-06: linked `55` groups and remapped `2067` rubber player references.

Manual review UI:
- Generate/update review page from live DB:
  - `pnpm --filter @tt-players/worker run player-merge:review`
- Open:
  - `docs/player-merge-review.html`
- In the page:
  - choose per-group `merge` or `skip`
  - for `merge`, select canonical row and alias rows
  - use `Source` link on each row to open the corresponding profile/search page
  - export decisions as CSV (`player-merge-review-decisions.csv`) for batch apply
