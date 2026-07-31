# Backend resource policy

The API is the user-facing service and must remain responsive while scraping, parsing, and rating jobs run.

## Process budgets

Production systemd units enforce relative priority:

- `ttp-api`: `CPUWeight=200`, `IOWeight=200`
- `ttp-worker`: `CPUWeight=20`, `IOWeight=20`, `Nice=10`

The worker remains single-job by default. Raising `WORKER_CONCURRENCY` requires measuring API latency under load first.

## PostgreSQL connections

The API and worker use separate connection budgets even when they share the same PostgreSQL database.

| Process | Pool | Default maximum |
| --- | --- | ---: |
| API data queries | Kysely / `pg` | 12 |
| Worker data queries | Kysely / `pg` | 2 in production systemd |
| Graphile Worker queue | `pg` | 3 |

Recommended production roles are `ttp_api` and `ttp_worker`, with the worker role receiving stricter statement and lock timeouts. The current deployment may continue using one role while the role split is prepared; the application-level pools and timeouts still apply.

## Environment variables

Common database variables:

- `DB_POOL_MAX`
- `DB_STATEMENT_TIMEOUT_MS`
- `DB_QUERY_TIMEOUT_MS`
- `DB_LOCK_TIMEOUT_MS`
- `DB_IDLE_TRANSACTION_TIMEOUT_MS`
- `DB_CONNECTION_TIMEOUT_MS`
- `DB_IDLE_TIMEOUT_MS`
- `DB_APPLICATION_NAME`

Graphile queue variables:

- `GRAPHILE_POOL_MAX` (minimum 2)
- `GRAPHILE_STATEMENT_TIMEOUT_MS`
- `GRAPHILE_QUERY_TIMEOUT_MS`
- `GRAPHILE_LOCK_TIMEOUT_MS`
- `GRAPHILE_IDLE_TRANSACTION_TIMEOUT_MS`
- `GRAPHILE_CONNECTION_TIMEOUT_MS`
- `GRAPHILE_IDLE_TIMEOUT_MS`
- `GRAPHILE_APPLICATION_NAME`

API operational variables:

- `LOG_LEVEL`
- `API_REQUEST_TIMEOUT_MS`
- `API_KEEP_ALIVE_TIMEOUT_MS`
- `API_BODY_LIMIT_BYTES`
- `API_SLOW_REQUEST_MS`
- `API_SHUTDOWN_TIMEOUT_MS`

## Operational rules

1. Do not increase worker concurrency or pool sizes without measuring API p95 latency during an active scrape.
2. Unexpected API errors are logged internally and returned to clients as `Internal Server Error`.
3. Both API and worker close their database pools on `SIGTERM` and `SIGINT`.
4. Migrations remain a deployment responsibility; normal runtime processes should use DML-only database permissions.
