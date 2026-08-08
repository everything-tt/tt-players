# TT Players Production Runbook

> Updated: 2026-07-30

This runbook is the operator checklist for production. It covers the public
frontend, VPS services, PostgreSQL, Graphile Worker scraping, calculated ratings,
deployments, logs, and resource checks.

Source of truth for infrastructure details: [`docs/deployment.md`](./deployment.md).

## Production Summary

| Area | Production value |
| --- | --- |
| Frontend | `https://ttp.tourneypilot.com` on Netlify |
| API | `https://ttp-api.tourneypilot.com` through Cloudflare Tunnel |
| VPS SSH alias | `tt-domain` |
| App directory | `/opt/tt-players` |
| API service | `ttp-api` |
| Worker service | `ttp-worker` |
| Tunnel service | `cloudflared` |
| Database service | `postgresql` |
| Database | `tt_players` on local PostgreSQL |
| Runtime user | `ttp` |

## Daily Cron Schedule

Graphile Worker owns the production schedule:

```text
02:00 UTC  scheduleScrapeTasks
02:30 UTC  scrapeSport80EventsTask
03:00 UTC  scrapeSport80RankingsDiscoveryTask
03:30 UTC  purgeExpiredCacheEntries
04:00 UTC  calculateRatingsTask
```

## Full Health Check

Run this first for a complete read-only production check.

```bash
# Public frontend and API
curl --fail --show-error --silent https://ttp.tourneypilot.com/health.json
curl --fail --show-error --silent https://ttp-api.tourneypilot.com/api/health
curl --fail --show-error --silent https://ttp-api.tourneypilot.com/api/health/db
curl --fail --show-error --silent https://ttp.tourneypilot.com/api/health
curl --fail --show-error --silent https://ttp.tourneypilot.com/api/players/count
curl --fail --show-error --silent https://ttp.tourneypilot.com/api/leagues
curl --fail --show-error --silent 'https://ttp.tourneypilot.com/api/ratings?page_size=5'

# DNS
dig +short ttp.tourneypilot.com
dig +short ttp-api.tourneypilot.com

# VPS services and local API
ssh tt-domain 'systemctl is-active ttp-api ttp-worker cloudflared postgresql'
ssh tt-domain 'curl -sf http://127.0.0.1:3005/api/health/db'
```

Expected:

- All `curl --fail` commands exit `0`.
- `systemctl is-active` prints `active` for all four services.
- `/api/ratings` returns non-empty `data` and `processing.status = complete`
  unless a rating job is actively running.

## Deployment Checks

Check the latest GitHub Actions production deploys:

```bash
gh run list --branch main --limit 10 \
  --json databaseId,name,headSha,status,conclusion,createdAt,updatedAt,url
```

Expected:

- `Deploy API and Database to VPS` is `completed` with `conclusion = success`
  for the latest backend-relevant `main` commit.
- `Build and Deploy Frontend` is `completed` with `conclusion = success` for
  the latest frontend-relevant `main` commit.

The VPS deployment is rsynced and does not keep `.git` metadata. To verify that
critical files match local `main`, compare checksums:

```bash
sha256sum apps/api/src/app.ts apps/worker/src/worker.ts apps/worker/src/tasks/calculateRatingsTask.ts
ssh tt-domain 'sha256sum /opt/tt-players/apps/api/src/app.ts /opt/tt-players/apps/worker/src/worker.ts /opt/tt-players/apps/worker/src/tasks/calculateRatingsTask.ts'
```

Expected: matching hashes for each corresponding file when local checkout is on
the same commit as the deployed source.

## VPS Service Checks

```bash
ssh tt-domain 'systemctl status ttp-api ttp-worker cloudflared postgresql --no-pager -l'
ssh tt-domain 'journalctl -u ttp-api -n 100 --no-pager -l'
ssh tt-domain 'journalctl -u ttp-worker -n 160 --no-pager -l'
```

Expected:

- Services are `active`.
- API logs do not show recurring crashes or DB errors.
- Worker logs show `Worker connected and looking for jobs`.
- Intermittent scrape failures from upstream websites can appear; investigate
  repeated failures with exhausted attempts or persistent parser errors.

## Resource Checks

```bash
ssh tt-domain 'free -h; df -h / /opt; uptime'
ssh tt-domain 'systemctl show ttp-api ttp-worker --property=ActiveState,SubState,MainPID,MemoryCurrent,CPUUsageNSec,NRestarts'
ssh tt-domain 'ps -o pid,user,pcpu,pmem,rss,etime,cmd -C node --sort=-pcpu | head -20'
```

Expected:

- Disk is not close to full. Treat `/` or `/opt` above 85% as a warning and
  above 95% as urgent.
- Memory is stable and there is no restart loop.
- Worker CPU can spike during scraping or ratings; it should settle after jobs.

## Database Checks

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select version();
select name, timestamp from kysely_migration order by timestamp desc limit 10;
select
  (select count(*) from leagues where deleted_at is null) as active_leagues,
  (select count(*) from external_players where deleted_at is null) as active_external_players,
  (select count(*) from fixtures where deleted_at is null) as active_fixtures,
  (select count(*) from rubbers where deleted_at is null) as active_rubbers;
"'
```

Expected:

- PostgreSQL responds.
- Latest migrations include the expected newest migration from `packages/db/src/migrations`.
- Row counts are non-zero and broadly consistent with `docs/deployment.md`.

Check active database work:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select pid, usename, state, wait_event_type, wait_event, now() - query_start as age, left(query, 500) as query
from pg_stat_activity
where datname = '\''tt_players'\''
  and state <> '\''idle'\''
order by query_start;
"'
```

Expected: no unexpectedly long-running API queries. Ratings or scrape jobs can
show active queries while jobs are running.

## Backup and BigQuery Checks

The detailed procedures live in [`docs/database-backup.md`](./database-backup.md)
and [`docs/bigquery-sync.md`](./bigquery-sync.md). The production deploy installs
the units but intentionally leaves their timers disabled until the credential
bootstrap, restore drill, initial warehouse refresh, and repeated incremental
run have all been verified.

```bash
ssh tt-domain 'systemctl status ttp-db-backup.timer ttp-bigquery-sync.timer ttp-bigquery-reconcile.timer --no-pager'
ssh tt-domain 'journalctl -u ttp-db-backup.service -u ttp-bigquery-sync.service -u ttp-bigquery-reconcile.service -n 200 --no-pager'
```

After the manual rollout gate is complete, inspect recent pipeline state with an
administrator BigQuery credential:

```bash
bq --project_id=wudong-agent-master --location=us-central1 query --use_legacy_sql=false '
SELECT table_name, mode, status, source_rows, completed_at
FROM `wudong-agent-master.tt_players_pipeline.sync_runs`
ORDER BY completed_at DESC
LIMIT 40'
```

Expected: the latest successful run has current timestamps for the tables in the
checked-in manifest, failed validation rows are investigated before timers are
enabled, and the latest backup has a verified `metadata.json` success marker.

The raw dataset contains both the canonical analytical tables and the scraper
provenance mirror. Confirm that the source/staging portion is present after the
first full refresh:

```bash
bq --project_id=wudong-agent-master --location=us-central1 query --use_legacy_sql=false '
SELECT table_id AS table_name, row_count
FROM `wudong-agent-master.tt_players_raw.__TABLES__`
WHERE table_id IN (
  "raw_scrape_logs", "source_instances", "source_resources",
  "source_events", "source_event_result_rows", "tournament_sources",
  "tournament_match_candidates", "scraping_pipeline_runs",
  "scraping_pipeline_run_stages"
)
ORDER BY table_name'
```

Expected: all nine tables exist. `raw_scrape_logs`, `source_events`, and
`source_event_result_rows` should have rows when the corresponding production
staging tables have rows. The two pipeline-run tables can be empty until the
daily pipeline has completed at least once.

Check that raw payloads and status transitions are reaching the warehouse:

```bash
bq --project_id=wudong-agent-master --location=us-central1 query --use_legacy_sql=false '
SELECT status, COUNT(*) AS rows, MAX(scraped_at) AS latest_scraped_at,
       MAX(updated_at) AS latest_updated_at,
       SUM(LENGTH(raw_payload)) AS payload_bytes
FROM `wudong-agent-master.tt_players_raw.raw_scrape_logs`
WHERE scraped_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)
GROUP BY status
ORDER BY status'
```

Expected: payload bytes are non-zero, and `updated_at` advances when the
worker changes a log from `pending` to `processed` or `failed`. Do not use the
raw dataset as a public application API; it contains upstream response bodies.

## Graphile Worker Queue Checks

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select t.identifier as task, count(*) as jobs,
       count(*) filter (where j.locked_at is not null) as locked,
       count(*) filter (where j.run_at <= now() and j.locked_at is null) as runnable,
       count(*) filter (where j.run_at > now()) as deferred,
       count(*) filter (where j.attempts >= j.max_attempts) as exhausted,
       min(j.run_at) as earliest_run_at,
       max(j.run_at) as latest_run_at
from graphile_worker._private_jobs j
join graphile_worker._private_tasks t on t.id = j.task_id
group by t.identifier
order by jobs desc, task;

select identifier, known_since, last_execution
from graphile_worker._private_known_crontabs
order by identifier;
"'
```

Expected:

- Cron identifiers are present for scrape, Sport80, cache purge, and ratings.
- Runnable jobs should drain when `ttp-worker` is active.
- Exhausted jobs need investigation.
- Deferred jobs are normal for retries/backoff.

Inspect exhausted jobs:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select j.id, t.identifier as task, j.attempts, j.max_attempts,
       j.run_at, j.created_at, j.updated_at,
       left(j.last_error, 900) as last_error,
       j.payload
from graphile_worker._private_jobs j
join graphile_worker._private_tasks t on t.id = j.task_id
where j.attempts >= j.max_attempts
order by j.run_at asc;
"'
```

## Scraping Checks

Check recent raw scrape activity:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select status, count(*) as rows, max(scraped_at) as latest_scraped_at
from staging.raw_scrape_logs
where scraped_at >= now() - interval '\''48 hours'\''
group by status
order by status;

select status, count(*) as rows, max(updated_at) as latest_updated_at
from staging.raw_scrape_logs
group by status
order by status;

select endpoint_url, status, scraped_at
from staging.raw_scrape_logs
order by scraped_at desc
limit 10;

select count(*) as failed_recent
from staging.raw_scrape_logs
where status = '\''failed'\''
  and scraped_at >= now() - interval '\''48 hours'\'';
"'
```

Expected:

- Recent `processed` scrape logs exist after the daily scrape window.
- A small number of failures can be normal when upstream sites reject or change
  responses; repeated failures for the same source should be investigated.

Check Sport80 event/ranking activity:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select status, count(*) as rows, max(updated_at) as latest_updated_at
from staging.sport80_event_scrape_state
group by status
order by status;

select count(*) as source_events, max(updated_at) as latest_source_event
from staging.source_events;

select count(*) as source_event_result_rows, max(updated_at) as latest_source_event_result
from staging.source_event_result_rows;

select list_kind, count(*) as rows, max(updated_at) as latest_updated_at
from staging.ranking_entries
group by list_kind
order by list_kind;
"'
```

Expected:

- Sport80 staging tables respond and have recent `updated_at`/`scraped_at`
  values after Sport80 cron jobs run.

## Rating Checks

Check rating processing state:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players -P pager=off -x -c "
select rm.key, rm.algorithm, rm.is_active,
       rps.status, rps.last_processed_date, rps.processed_periods,
       rps.processed_matches, rps.started_at, rps.finished_at,
       rps.updated_at, rps.last_error
from rating_models rm
left join rating_processing_state rps on rps.model_id = rm.id
order by rm.key;

select count(*) as rating_rows,
       min(last_rated_at) as min_last_rated_at,
       max(last_rated_at) as max_last_rated_at,
       sum(rated_matches) as total_rated_matches,
       max(updated_at) as latest_rating_update
from player_ratings;
"'
```

Expected:

- `rating_models` includes `global-singles-glicko2-v1`.
- `rating_processing_state.status` is `complete` or `running`.
- `last_error` is null.
- `player_ratings` has rows after the first backfill.

Check public ratings API:

```bash
curl --fail --show-error --silent 'https://ttp-api.tourneypilot.com/api/ratings?page_size=5'
curl --fail --show-error --silent 'https://ttp.tourneypilot.com/api/ratings?page_size=5'
```

Expected: both return non-empty `data`, pagination, model, and processing
metadata.

### Run Ratings Manually

Use this only when the scheduled job missed its first run or an operator
intentionally wants to catch up. The command is resumable and protected by an
advisory lock.

```bash
ssh tt-domain 'systemd-run --unit=ttp-ratings-backfill --description="TT Players ratings backfill" \
  --property=User=ttp \
  --property=Group=ttp \
  --property=WorkingDirectory=/opt/tt-players/apps/worker \
  --property=EnvironmentFile=/etc/ttp/worker.env \
  --property=Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --property=Environment=HOME=/home/ttp \
  --property=NoNewPrivileges=true \
  --property=PrivateTmp=true \
  --property=ProtectHome=true \
  --property=ProtectSystem=full \
  --property=ReadWritePaths=/opt/tt-players \
  /opt/tt-players/apps/worker/node_modules/.bin/tsx src/calculate-ratings-once.ts --max-periods=100000'
```

Monitor:

```bash
ssh tt-domain 'systemctl status ttp-ratings-backfill --no-pager -l'
ssh tt-domain 'journalctl -u ttp-ratings-backfill -n 120 --no-pager -l'
```

Expected: the job exits successfully and logs JSON with `complete: true`.

## Frontend Checks

```bash
curl --fail --show-error --silent https://ttp.tourneypilot.com/health.json
curl --fail --show-error --silent -I https://ttp.tourneypilot.com/
curl --fail --show-error --silent -I https://ttp.tourneypilot.com/players
curl --fail --show-error --silent https://ttp.tourneypilot.com/api/health
```

Expected:

- Netlify serves the SPA and health file.
- `/api/*` proxy reaches the VPS API.

## Troubleshooting Shortcuts

API unavailable:

```bash
ssh tt-domain 'systemctl status ttp-api cloudflared postgresql --no-pager -l'
ssh tt-domain 'journalctl -u ttp-api -n 200 --no-pager -l'
ssh tt-domain 'curl -sf http://127.0.0.1:3005/api/health/db'
```

Worker not processing:

```bash
ssh tt-domain 'systemctl status ttp-worker --no-pager -l'
ssh tt-domain 'journalctl -u ttp-worker -n 240 --no-pager -l'
ssh tt-domain 'sudo -u postgres psql -d tt_players -c "select * from graphile_worker.jobs order by run_at asc limit 20;"'
```

RLS or Graphile permission errors:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players --file /opt/tt-players/infra/postgres/9999_application_grants.sql'
ssh tt-domain 'systemctl restart ttp-worker'
```

Disk pressure:

```bash
ssh tt-domain 'df -h / /opt; du -sh /opt/tt-players /var/log /var/lib/postgresql 2>/dev/null'
```

## Operator Notes

- Prefer read-only checks first.
- Do not run destructive database commands from this runbook.
- Manual ratings catch-up is safe to run when needed, but avoid running multiple
  manual rating services intentionally; the app-level advisory lock will make
  duplicates exit busy, but duplicate runs add noise.
- Late-arriving historical match results are not automatically replayed by the
  incremental rating algorithm. A full rebuild or a future lookback mechanism is
  required for historical corrections.
