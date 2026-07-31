# Backend performance baseline

This runbook produces repeatable API latency and PostgreSQL plan artifacts. It is intentionally separate from CI: useful performance numbers require a production-shaped database and realistic worker activity.

## Principles

- Measure from the VPS loopback interface to remove Cloudflare and internet latency.
- Capture an idle baseline and a worker-active baseline with the same command.
- Keep benchmark request counts modest on production.
- Treat query plans and JSON reports as evidence. Do not tune from intuition alone.
- Never run `EXPLAIN ANALYZE` on an unfamiliar expensive query during peak traffic.

## HTTP baseline

Run from the VPS while the API is listening on `127.0.0.1:3005`:

```bash
pnpm perf:api -- \
  --base-url http://127.0.0.1:3005 \
  --requests 200 \
  --concurrency 5 \
  --warmup 20 \
  --json-out artifacts/backend-idle.json
```

The default endpoints are:

- `/api/health`
- `/api/leagues`
- `/api/players/count`
- `/api/ratings?page=1&page_size=50`
- `/api/sources/quality`

Use repeated `--endpoint` arguments to measure a specific route. The tool consumes each response body and records status counts, failures, throughput, and min/average/p50/p95/p99/max latency.

A run exits non-zero when any request fails.

## Worker-contention comparison

Capture the idle report first. Then repeat the exact same command while the worker is naturally processing its scheduled scrape or rating workload:

```bash
pnpm perf:api -- \
  --base-url http://127.0.0.1:3005 \
  --requests 200 \
  --concurrency 5 \
  --warmup 20 \
  --json-out artifacts/backend-worker-active.json
```

Do not manufacture a large production backfill merely to create contention. Use a staging copy or observe a normal scheduled run.

Compare, per endpoint:

- p95 and p99 latency
- throughput
- error rate
- worker-active p95 increase versus idle p95

## PostgreSQL query plans

Capture plans without executing the measured queries:

```bash
DATABASE_URL='postgresql://...' pnpm perf:plans -- \
  --out artifacts/backend-query-plans.json
```

After reviewing the plain plans, capture timing and buffer evidence during a safe window:

```bash
DATABASE_URL='postgresql://...' pnpm perf:plans -- \
  --analyze \
  --out artifacts/backend-query-plans-analyze.json
```

The tool selects representative league and team IDs from the target database and captures plans for:

- source-quality snapshot lookup
- global ratings page
- league-scoped ratings page
- team fixtures page

The JSON summary includes planning/execution time, plan node and row counts, shared hit/read blocks, and temporary blocks.

## Initial targets

These are engineering targets, not measured production claims. Revisit them after several representative baselines.

| Request class | Initial loopback target |
| --- | ---: |
| Health | p95 under 100 ms |
| Read-model/cache lookup | p95 under 200 ms |
| Normal list/detail endpoint | p95 under 300 ms |
| Error rate | 0% |
| Worker-active p95 increase | no more than 20% versus idle |

For query plans, investigate:

- sequential scans over large transactional tables on normal API requests
- unexpected temporary-file writes
- high shared-read counts on repeated warm requests
- estimated rows that differ greatly from actual rows
- execution times near the API statement timeout

## Recording a baseline

Record alongside each artifact:

- commit SHA
- database row-count snapshot
- whether caches/read models were warm
- API and worker pool settings
- whether the worker was idle or active
- VPS CPU and memory size
- exact benchmark command

Keep raw artifacts outside source control unless they represent an agreed durable baseline. Summarize accepted results in this document or a dated performance report.
