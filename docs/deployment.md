# TT Players — Deployment

> Updated: 2026-07-29

This document is the production deployment runbook for TT Players. It records
the migration from the previous Render + Aiven stack onto the self-hosted VPS
used by the other TourneyPilot apps, using the same infrastructure pattern as
TT Learning Library and TourneyPilot.

## Previous stack (retired)

Until 2026-07-29 the app ran on Render (static site + web service) with Aiven
PostgreSQL. The Aiven `tt-players-db` free-tier service was deleted (its hostname
no longer resolves), which took the Render API down. The full source-of-truth
dataset lived in the local Docker database, so the migration copied that data
verbatim onto the VPS. The old Render services and `tt-players.graceliu.uk`
hostname are no longer part of this deployment.

## Production architecture

```text
Browser
  |
  +-- https://ttp.tourneypilot.com
  |     Netlify (apps/mobile PWA)
  |       /api/* → https://ttp-api.tourneypilot.com/api/* (proxy, preserves POST)
  |       /*     → /index.html (SPA fallback)
  |
  +-- https://ttp-api.tourneypilot.com
        Cloudflare Tunnel
          |
          +-- http://127.0.0.1:3005
                Fastify API (systemd: ttp-api)
                  |
                  +-- PostgreSQL on 127.0.0.1:5432
                  |     Database: tt_players
                  |
                  +-- Graphile Worker (systemd: ttp-worker)
                  |     ETL scraping + loading (cron schedule)
                  |
                  +-- feedback proxy → https://feedback.graceliu.uk
```

## Public endpoints

| Endpoint | Purpose | Origin |
| --- | --- | --- |
| `https://ttp.tourneypilot.com/` | PWA | Netlify |
| `https://ttp-api.tourneypilot.com/api/health` | API health (lightweight) | VPS through Cloudflare Tunnel |
| `https://ttp-api.tourneypilot.com/api/health/db` | API + database health | VPS through Cloudflare Tunnel |
| `https://ttp.tourneypilot.com/health.json` | Static frontend health | Netlify |

## Hetzner VPS (shared)

The app shares the `tt-domain` VPS with TT Learning Library and TourneyPilot.

| Setting | Value |
| --- | --- |
| Provider | Hetzner Cloud |
| Server | `tt-domain` |
| Public IPv4 | `5.75.166.235` |
| Operating system | Ubuntu 26.04 LTS, x86_64 |
| PostgreSQL | 18 (loopback only, `127.0.0.1:5432`) |
| Application directory | `/opt/tt-players` |
| Runtime user | `ttp:ttp` |

### Services

Two systemd services run the app:

```bash
systemctl status ttp-api ttp-worker cloudflared postgresql
journalctl -u ttp-api -n 100 --no-pager
journalctl -u ttp-worker -n 100 --no-pager
```

The units are versioned in [`infra/systemd/`](../infra/systemd) and installed as
`/etc/systemd/system/ttp-api.service` and `/etc/systemd/system/ttp-worker.service`.

The deployed API has:

- working directory: `/opt/tt-players/apps/api`
- process: `tsx src/server.ts` (Node 22 via the workspace `tsx` bin)
- bind address: `127.0.0.1:3005` (loopback only; `HOST` env)
- environment file: `/etc/ttp/api.env`
- restart policy: restart on failure after three seconds

The worker has:

- working directory: `/opt/tt-players/apps/worker`
- process: `tsx src/worker.ts` (Graphile Worker, cron-scheduled ETL)
- environment file: `/etc/ttp/worker.env`
- restart policy: restart on failure after three seconds

PostgreSQL listens only on `127.0.0.1:5432` and `::1:5432`. The production
database is `tt_players`. It is not exposed to the public internet.

### API environment

`/etc/ttp/api.env` is readable only by root (systemd reads it as root and passes
it to the service). It contains:

```dotenv
DATABASE_URL=postgresql://ttp_app:<password>@127.0.0.1:5432/tt_players
HOST=127.0.0.1
PORT=3005
ALLOWED_ORIGIN=https://ttp.tourneypilot.com,https://tt-players.graceliu.uk
FEEDBACK_SERVICE_URL=https://feedback.graceliu.uk
```

`/etc/ttp/worker.env` contains:

```dotenv
DATABASE_URL=postgresql://ttp_app:<password>@127.0.0.1:5432/tt_players
SCRAPE_STARTUP_RECOVERY_ENABLED=true
```

The `SPORT80_API_TOKEN` has a built-in default; override it here only if needed.

### SSH access

The normal operator path uses the Cloudflare Tunnel (already configured for
`vps.tourneypilot.com`). The local SSH alias is `tt-domain`:

```sshconfig
Host tt-domain vps.tourneypilot.com
    HostName vps.tourneypilot.com
    User root
    IdentityFile ~/.ssh/tt-domain-rescue
    IdentitiesOnly yes
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    StrictHostKeyChecking accept-new
```

GitHub Actions connects directly to port 22 on `5.75.166.235` with the
`VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` secrets (a dedicated deploy key whose
public key is in `/root/.ssh/authorized_keys`).

## Cloudflare

DNS and the tunnel live in the `tourneypilot.com` Cloudflare zone. The named
tunnel `tt-domain` (tunnel ID `e0b3147c-983e-46bf-b5cf-e6f443e3ab63`) is shared
with the other apps. The TT Players ingress rule added to the tunnel:

| Public hostname | Tunnel origin |
| --- | --- |
| `ttp-api.tourneypilot.com` | `http://127.0.0.1:3005` |

`cloudflared` runs as a systemd service with a token file
(`/etc/cloudflared/token`). Tunnel ingress is remote-managed via the Cloudflare
API (token in GCP Secret Manager `ttlive-domain-cloudflare-tunnel-api-token`).

### DNS records

| Hostname | Type | Target | Proxied | SSL |
| --- | --- | --- | --- | --- |
| `ttp.tourneypilot.com` | CNAME | `ttp-players.netlify.app` | No (DNS only) | Netlify (Let's Encrypt) |
| `ttp-api.tourneypilot.com` | CNAME | `e0b3147c….cfargotunnel.com` | Yes | Cloudflare |

The frontend CNAME is intentionally **unproxied (DNS only)** so Netlify
provisions and renews its own Let's Encrypt certificate. Cloudflare Universal SSL
does not cover deeper subdomains, so never proxy the Netlify CNAME through
Cloudflare without an explicit SSL plan.

## Netlify frontend

Netlify serves the PWA built from `apps/mobile`. The build is produced by
[`.github/workflows/build.yml`](../.github/workflows/build.yml) and
`apps/mobile/dist` is deployed with the `nwtgck/actions-netlify` action.

- Site name: `ttp-players` (`https://ttp-players.netlify.app`)
- Site ID: `29f4fa3e-28d4-4b33-a3d4-5ee55ba07fb3`
- Custom domain: `ttp.tourneypilot.com`

[`netlify.toml`](../netlify.toml) provides:

- `/api/*` proxy to `https://ttp-api.tourneypilot.com/api/:splat` (force)
- SPA fallback `/*` → `/index.html`
- Immutable caching for hashed assets; no-cache for the service worker

The frontend is built with `VITE_API_URL=/api` so browser calls are same-origin
and proxied by Netlify to the VPS API. `apps/mobile/public/_redirects` mirrors
the `netlify.toml` routing so the published artifact stays consistent.

## PostgreSQL and migrations

The application database runs on the VPS PostgreSQL instance. Schema and
migrations are managed by Kysely in the `@tt-players/db` workspace package:

- `packages/db/src/migrations/` — numbered incremental migrations.
- `packages/db/src/migrate.ts` — the Kysely migration CLI.

[`scripts/migrate-vps-postgres.sh`](../scripts/migrate-vps-postgres.sh):

1. runs the Kysely migrator (`packages/db/src/migrate.ts`) with **`bun`** as the
   PostgreSQL superuser. `bun` is used (not `pnpm`) because the script runs as
   the `postgres` OS user, which has only read access to `/opt/tt-players`; `bun`
   runs the TypeScript directly without writing temp files into the project
   directory, whereas `pnpm run` does. The app role `ttp_app` is DML-only and
   cannot run DDL.
2. applies [`infra/postgres/9999_application_grants.sql`](../infra/postgres/9999_application_grants.sql),
   which grants `ttp_app` DML on `public`/`staging` and ownership/CREATE on the
   `graphile_worker` schema (the worker self-manages it and bypasses its RLS).

The deploy workflow runs the migrator as the PostgreSQL operating-system user:

```bash
sudo -u postgres env DATABASE_URL=postgresql:///tt_players?host=/var/run/postgresql \
  ./scripts/migrate-vps-postgres.sh
```

Migrations are forward-only. The migration table is `kysely_migration`.

## Database provisioning and data copy

The production database was populated from the local Docker source-of-truth
database (the Aiven production database had been deleted). The procedure below
is the authoritative way to (re)seed the VPS database with no data loss.

1. Create the role and database on the VPS:

   ```bash
   ssh tt-domain
   useradd --system --create-home --shell /usr/sbin/nologin ttp
   mkdir -p /opt/tt-players /etc/ttp && chmod 700 /etc/ttp
   openssl rand -base64 30 > /etc/ttp/.db_password && chmod 600 /etc/ttp/.db_password
   PW=$(cat /etc/ttp/.db_password)
   sudo -u postgres psql -c "CREATE ROLE ttp_app LOGIN PASSWORD '$PW';"
   sudo -u postgres createdb -O postgres tt_players
   ```

2. Take a full dump from the source database (custom format, all schemas):

   ```bash
   docker exec tt_players_postgres pg_dump -U postgres -d tt_players \
     --format=custom --no-owner --no-acl > tt_players_full.dump
   shasum -a 256 tt_players_full.dump
   ```

3. Transfer and verify the checksum, then restore:

   ```bash
   rsync -az tt_players_full.dump tt-domain:/tmp/tt_players_full.dump
   ssh tt-domain 'sha256sum /tmp/tt_players_full.dump'   # must match source
   ssh tt-domain 'sudo -u postgres pg_restore --no-owner --no-acl --exit-on-error \
     --dbname "postgresql:///tt_players?host=/var/run/postgresql" \
     /tmp/tt_players_full.dump'
   ```

4. Apply grants and run pending migrations:

   ```bash
   ssh tt-domain 'sudo -u postgres psql -d tt_players \
     --file /opt/tt-players/infra/postgres/9999_application_grants.sql'
   ssh tt-domain 'sudo -u postgres env DATABASE_URL=postgresql:///tt_players?host=/var/run/postgresql \
     /usr/local/bin/bun /opt/tt-players/packages/db/src/migrate.ts'
   ```

5. Write the env files (`/etc/ttp/api.env`, `/etc/ttp/worker.env`) using the
   password from `/etc/ttp/.db_password`, install the systemd units, and start
   the services.

A copy of the full restore dump is kept on the VPS at
`/root/tt_players_full_20260729.dump` (784 MB) as an on-VPS re-seed source; the
original also lives in the repo's `backups/` directory.

### Expected row counts (post-copy verification)

These are the **restore-time baselines** — the restored database must match the
source exactly at the moment of restore. The `ttp-worker` keeps scraping, so
`staging.raw_scrape_logs` and the ranking/source-event tables grow over time
(e.g. `raw_scrape_logs` rose from 127,905 to 127,950 within minutes of the worker
starting). The counts below are the post-restore snapshot:

| Table | Rows |
| --- | --- |
| `public.leagues` | 193 |
| `public.seasons` | 1,126 |
| `public.competitions` | 10,479 |
| `public.teams` | 26,662 |
| `public.fixtures` | 221,054 |
| `public.rubbers` | 2,714,524 |
| `public.external_players` | 140,454 |
| `staging.raw_scrape_logs` | 127,905 |
| `staging.ranking_entries` | 2,246,477 |
| `staging.source_event_result_rows` | 807,828 |

## GitHub Actions

### Frontend: Build and Deploy

Workflow: [`.github/workflows/build.yml`](../.github/workflows/build.yml)

Triggers: pushes to `main` (frontend paths) and pull requests. Builds the PWA
with Vite and deploys to Netlify. Pull requests receive preview deployments.

Production frontend deployment runs only on a push to `main` and uses the
frontend-specific Google Workload Identity Federation reader. Pull-request
builds are unprivileged. Same-repository preview deployment retains the
documented GitHub-managed preview token exception; fork pull requests receive
no Netlify or Google credential.

### Backend: Deploy API and Database to VPS

Workflow: [`.github/workflows/vps-deploy.yml`](../.github/workflows/vps-deploy.yml)

Triggers: relevant API/worker/infra/migration/shared package changes pushed to
`main`, plus manual `workflow_dispatch`. The production job:

1. installs dependencies and typechecks;
2. runs the database test suite against a Postgres service container;
3. authenticates to Google Cloud with the TT Players runtime Workload Identity
   Federation provider, loads the VPS and provider credentials from Google
   Secret Manager, and uses repository Variables for public host/configuration;
4. `rsync --delete` updates `/opt/tt-players`;
5. `CI=true pnpm install --frozen-lockfile` on the VPS (the `CI=true` is
   required so pnpm reconciles `node_modules` non-interactively, since the VPS
   `pnpm` may differ from the corepack-pinned version that built the tree) and
   fixes ownership;
6. applies PostgreSQL migrations;
7. restarts `ttp-api` and `ttp-worker`;
8. verifies the services and `https://ttp-api.tourneypilot.com/api/health`.

Deployments are serialized by the `vps-production-ttp` concurrency group.

## GitHub Actions configuration

Public repository Variables:

| Variable | Used for |
| --- | --- |
| `NETLIFY_SITE_ID` | Select the `ttp-players` Netlify site |
| `TT_PLAYERS_VPS_HOST` | Deployment SSH host (`5.75.166.235`) |
| `TT_PLAYERS_VPS_USER` | Deployment SSH user (`root`) |
| `TT_PLAYERS_VPS_HOST_KEY` | Pinned `ssh-ed25519` host key used for strict SSH verification |
| `VITE_SUPABASE_URL` | Public frontend/API Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public frontend Supabase publishable key |

Each production workload also has a WIF provider and reader service-account
Variable documented in the [GCP WIF runbook](https://github.com/wudong/gcloud/blob/main/docs/tt-players-github-secrets.md).

The intentionally remaining GitHub-managed credentials are:

- `NETLIFY_AUTH_TOKEN` for same-repository pull-request previews;
- `UI_AUDIT_EMAIL`, `UI_AUDIT_PASSWORD`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, and the Main UI Audit's Netlify credentials
  for the existing audit workflow. Its Secret Manager migration is deferred.

Production frontend, SSH, runtime configuration, and backfill jobs use their
least-privilege Google Secret Manager readers instead.

## Google Cloud Secret Manager

Operational credentials are stored in Google Cloud Secret Manager project
`wudong-agent-master`. Relevant secret IDs for this app:

```text
tt-players-hetzner-db-password
tt-players-hetzner-vps-deploy-key
tt-players-netlify-auth-token
tt-players-netlify-site-id   (legacy metadata; CI uses the `NETLIFY_SITE_ID` Variable)
tt-players-ui-audit-email   (reserved for the deferred Main UI Audit migration)
tt-players-ui-audit-password (reserved for the deferred Main UI Audit migration)
cloudflare-account-id
cloudflare-ai-api-token
ollama-api-key
ttlive-domain-cloudflare-tunnel-api-token   (shared tunnel/DNS management)
```

Secret Manager is the source of truth for confidential CI/runtime values. The
WIF provider and per-workload Secret Manager allowlists are maintained in the
`wudong/gcloud` repository. Secret values are never placed in this repository,
workflow summaries, artifacts, Terraform variables, or SSH command arguments.

The `ttlive-domain-cloudflare-tunnel-api-token` is shared with the other apps on
this VPS; it grants Cloudflare Tunnel configuration and `tourneypilot.com` DNS
edits.

## Post-deploy verification

```bash
# Backend (through tunnel)
curl --fail https://ttp-api.tourneypilot.com/api/health
curl --fail https://ttp-api.tourneypilot.com/api/health/db
curl -s https://ttp-api.tourneypilot.com/api/players/count
curl -s https://ttp-api.tourneypilot.com/api/leagues | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',d)),'leagues')"

# Frontend (Netlify) + /api proxy
curl --fail https://ttp.tourneypilot.com/health.json
curl --fail https://ttp.tourneypilot.com/api/health
curl -s https://ttp.tourneypilot.com/api/players/count

# Services on the VPS
ssh tt-domain 'systemctl is-active ttp-api ttp-worker cloudflared postgresql'
ssh tt-domain 'curl -sf http://127.0.0.1:3005/api/health/db'
```

Expected: health endpoints `200`, `192` leagues via the API, `138941` players.

## Troubleshooting

### API returns 502 or is unavailable

```bash
ssh tt-domain
systemctl status ttp-api ttp-worker cloudflared
journalctl -u ttp-api -n 200 --no-pager
curl -sf http://127.0.0.1:3005/api/health
```

If the local check works but the public check fails, inspect `cloudflared` and
the tunnel ingress rule for `ttp-api.tourneypilot.com`.

### Worker fails with row-level security errors

The worker must own the `graphile_worker` objects. Re-run the grants file, which
transfers ownership to `ttp_app`:

```bash
ssh tt-domain 'sudo -u postgres psql -d tt_players \
  --file /opt/tt-players/infra/postgres/9999_application_grants.sql'
systemctl restart ttp-worker
```

### Database errors

```bash
ssh tt-domain
systemctl status postgresql
sudo -u postgres psql -d tt_players -c "select count(*) from kysely_migration;"
```

## Local development

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The local web origin is `http://localhost:7474` and the API listens on
`http://localhost:4003`. PostgreSQL is required.
