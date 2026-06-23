# TT Players Deployment

This document records the deployment completed on 2026-06-01 and verified on
2026-06-02. It is the authoritative reference for the current production
deployment and replaces the old Netlify/Terraform deployment path.

The current production stack is:

- Frontend: Render Static Site, `tt-players`
- Backend API: Render Web Service, `tt-players-api`
- Database: Aiven PostgreSQL, `tt-players-db`
- DNS: Cloudflare zone `graceliu.uk`
- Custom domain: `tt-players.graceliu.uk`

## Why This Stack

The original deployment split the app across Netlify and Aiven. That worked for
static hosting, but it made same-domain API routing and regional placement less
direct. We moved the frontend and backend to Render so the UI and API can be
operated from one hosting platform, while keeping PostgreSQL on Aiven because
Aiven provides a free PostgreSQL plan in Europe.

The main selection criteria were:

- Free tier where possible.
- Backend and database in nearby European regions to reduce latency.
- Simple custom-domain setup.
- A same-origin frontend API path, `/api`, so browser code does not need to call
  the API service hostname directly.
- External keep-awake pings for the free Render backend, which can spin down
  after inactivity.
- CLI or API access for every hosted service so the deployment can be recreated
  and checked without relying only on dashboards.

Render was selected for both frontend and backend. Aiven was selected for
PostgreSQL. Cloudflare remains the DNS provider.

## Current Services

### Render Static Site

- Service name: `tt-players`
- Service ID: `srv-d8etg0cp3tds738vh8v0`
- Type: Static Site
- Repository: `https://github.com/wudong/tt-players`
- Branch: `main`
- Root directory: `.`
- Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @tt-players/mobile build
```

- Publish path:

```text
apps/mobile/dist
```

- Render URL:

```text
https://tt-players.onrender.com
```

- Custom domain:

```text
https://tt-players.graceliu.uk
```

- Custom domain status on 2026-06-02: `verified`
- Auto deploy: enabled on commits to `main`

Static service environment variables:

```text
NODE_VERSION=20
VITE_API_URL=/api
```

The frontend must use the relative API base URL `/api`. This keeps browser
requests on the same public domain as the UI.

Frontend health endpoint:

```text
https://tt-players.graceliu.uk/health.json
```

This is a static file at `apps/mobile/public/health.json`, copied into the Vite
build and served directly by Render.

### Render API Service

- Service name: `tt-players-api`
- Service ID: `srv-d8etcqmq1p3s739nl6fg`
- Type: Web Service
- Runtime: Node
- Plan: Free
- Region: Frankfurt
- Repository: `https://github.com/wudong/tt-players`
- Branch: `main`
- Root directory: `.`
- Build command:

```bash
pnpm install --frozen-lockfile && pnpm --filter @tt-players/api... build
```

- Start command:

```bash
pnpm --filter @tt-players/api start
```

- Direct Render URL:

```text
https://tt-players-api.onrender.com
```

- Auto deploy: enabled on commits to `main`

API service environment variables:

```text
NODE_VERSION=20
ALLOWED_ORIGIN=https://tt-players.onrender.com,https://tt-players.graceliu.uk
DATABASE_URL=postgres://.../tt_players?sslmode=require
NODE_TLS_REJECT_UNAUTHORIZED=0
```

`DATABASE_URL` must point at the Aiven PostgreSQL service and must include
`sslmode=require`. The app also handles this in `packages/db/src/database.ts` by
enabling TLS for Postgres connection strings that contain `sslmode=require`.

`NODE_TLS_REJECT_UNAUTHORIZED=0` was added during deployment to work around TLS
certificate validation against Aiven from Render. The preferred long-term
hardening is to install and configure Aiven's CA certificate instead of disabling
certificate verification globally.

Backend health endpoint:

```text
https://tt-players.graceliu.uk/api/health
```

This endpoint is intentionally lightweight and does not query PostgreSQL. It is
safe to use for frequent uptime pings whose purpose is keeping the free Render
API service warm.

### Render Static Rewrite

The frontend service has two Render rewrite routes:

```text
source: /api/*
destination: https://tt-players-api.onrender.com/api/*
type: rewrite
route_id: rdr-d8f8jp3bc2fs73efgo7g
```

```text
source: /*
destination: /index.html
type: rewrite
```

The `/api/*` rule proxies browser API calls to the backend without exposing the API hostname in frontend code. The catch-all `/*` rule is required for the React SPA router so deep links such as `/players/:playerId` load the app shell directly on refresh or first visit.

### Aiven PostgreSQL

- Service name: `tt-players-db`
- Database name: `tt_players`
- Plan: `free-1-5gb`
- Cloud/region: `do-fra`
- PostgreSQL version: 17
- Public PostgreSQL access: enabled

The original Aiven database was in `do-nyc`. We replaced it with a new Aiven
PostgreSQL service in `do-fra` so it is close to the Render API service in
Frankfurt. The old remote database was empty before deletion. The local database
was never deleted.

### Cloudflare DNS

- Zone: `graceliu.uk`
- Nameservers observed:

```text
elinore.ns.cloudflare.com
piotr.ns.cloudflare.com
```

- Production app hostname:

```text
tt-players.graceliu.uk
```

The hostname is registered as a custom domain on the Render static service and
verified by Render. DNS is managed in Cloudflare.

## Code Changes Made For Deployment

The deployment required these repository changes:

- Added API production scripts so Render can run the Fastify API directly:

```json
{
  "build": "tsc -p tsconfig.json --noEmit",
  "start": "tsx src/server.ts"
}
```

- Pinned pnpm at the workspace root:

```json
{
  "packageManager": "pnpm@10.24.0"
}
```

- Excluded API tests from the production TypeScript build. Render builds on
  Linux exposed a `supertest` type error from `src/__tests__`; production builds
  should not compile tests.

- Enabled Aiven TLS handling in the shared DB package when `sslmode=require` is
  present in `DATABASE_URL`.

- Changed API CORS to accept a comma-separated `ALLOWED_ORIGIN`, covering both
  the Render default domain and the custom domain.

- Changed the frontend API base URL to `/api` on Render.

- Added a Render static rewrite from `/api/*` to the API service.

## Deployment History

Important commits from the migration:

```text
7bc87d1 Add Render API start scripts
245adc7 Pin pnpm for Render builds
aba66aa Run API service directly on Render
44272f2 Exclude API tests from production build
9372816 Allow Aiven TLS for Postgres connections
0233bf0 Allow multiple API CORS origins
```

The latest verified live Render deploys were:

- API deploy: `dep-d8f8kcl53gjs739r3gd0`
- Static deploy: `dep-d8f8kcuq1p3s73dmpth0`
- Commit: `0233bf0cd5ac448f759fb18a3b1de04b290e9a61`
- Status: `live`

## Local Database Safety And Migration

The local database contains the source data and must not be deleted.

### Schema Segregation Recommendation
As the scrape history grows, the local database size will exceed the free 1.5 GB limit of the Aiven PostgreSQL cluster (reaching over 2.2 GB with indexes). To operate within the limit, we recommend segregating the database tables:
- **Scrape & Auxiliary Schema (Local only)**: Heavy logging and staging data (`raw_scrape_logs`, `ranking_entries`) that contain verbose JSON/HTML payloads. These are only needed locally for ETL processing and are never queried by the Fastify REST API. Excluding their data saves ~1.9 GB of database space.
- **Canonical Schema (Production / API)**: Clean, structured tables required by the REST API (`leagues`, `competitions`, `teams`, `fixtures`, `rubbers`, `external_players`, `source_events`, `source_event_result_rows` with payloads excluded).

### Pruned Backup Creation
When backing up the local database for production upload, always run a pruned dump that excludes the raw audit and staging data using `--exclude-table-data`:

```bash
mkdir -p backups
backup_path="backups/tt_players_local_pruned_$(date -u +%Y%m%dT%H%M%SZ).dump"

# Dump the full schema structure but exclude the massive raw scrape/ranking data payloads
pg_dump --format=custom --no-owner --no-acl \
  --exclude-table-data="raw_scrape_logs" \
  --exclude-table-data="ranking_entries" \
  --file "$backup_path" \
  "$LOCAL_DATABASE_URL"

shasum -a 256 "$backup_path" > "$backup_path.sha256"
pg_restore --list "$backup_path" > /dev/null
```
This produces a compact dump (~219 MB) that safely fits on the Aiven free plan.

### Recovering From Aiven Read-Only Lock
If a full database upload is attempted, Aiven will hit its 1.5 GB threshold, fail the restore, and lock the cluster into a read-only transaction state (`cannot execute ALTER TABLE in a read-only transaction`). To recover:
1. Log in to your Aiven web console.
2. Under the `tt-players-db` service, go to **Databases** and delete the `tt_players` database.
3. Re-create the `tt_players` database. This drops disk usage back to 0 and immediately deactivates the read-only lock.
4. Restore the pruned dump to Aiven:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$REMOTE_DATABASE_URL" \
  backups/tt_players_local_pruned_YYYYMMDDTHHMMSSZ.dump
```

Use a fresh remote database or an explicitly approved empty remote database for restore. Never point destructive restore commands at the local database.

## Recreating The Deployment

### Prerequisites

Install and authenticate these CLIs:

```bash
render --version
avn --version
wrangler --version
```

Render CLI was authenticated during verification. Aiven CLI and Wrangler were
installed, but this shell did not have usable auth for them on 2026-06-02. For a
fresh recreation, log in before running provider commands:

```bash
render login
avn user login
wrangler login
```

Also install local database tools:

```bash
psql --version
pg_dump --version
pg_restore --version
```

### 1. Create The Aiven Database

Create a PostgreSQL service in Europe, preferably `do-fra`, on the free plan:

```bash
avn service create tt-players-db \
  --service-type pg \
  --cloud do-fra \
  --plan free-1-5gb \
  --project "$AIVEN_PROJECT"
```

Create or confirm the application database:

```bash
avn service database-create tt-players-db tt_players \
  --project "$AIVEN_PROJECT"
```

Fetch the connection string and store it securely:

```bash
avn service get tt-players-db --project "$AIVEN_PROJECT"
avn service connection-info tt-players-db --project "$AIVEN_PROJECT"
```

The final `DATABASE_URL` used by Render must include:

```text
?sslmode=require
```

### 2. Back Up And Restore Data

Back up local PostgreSQL first, then restore to the remote Aiven database. Use
the commands in the "Local Database Safety And Migration" section.

After restore, verify representative row counts:

```bash
psql "$REMOTE_DATABASE_URL" -c "
select 'external_players' as table_name, count(*) from external_players
union all select 'fixtures', count(*) from fixtures
union all select 'leagues', count(*) from leagues
union all select 'raw_scrape_logs', count(*) from raw_scrape_logs
union all select 'rubbers', count(*) from rubbers
order by table_name;
"
```

### 3. Create The Render API Service

Create a Render Web Service from the GitHub repository:

```text
Repository: https://github.com/wudong/tt-players
Branch: main
Root directory: .
Runtime: Node
Region: Frankfurt
Plan: Free
Build command: pnpm install --frozen-lockfile && pnpm --filter @tt-players/api... build
Start command: pnpm --filter @tt-players/api start
```

Set environment variables:

```text
NODE_VERSION=20
DATABASE_URL=postgres://.../tt_players?sslmode=require
ALLOWED_ORIGIN=https://tt-players.onrender.com,https://tt-players.graceliu.uk
NODE_TLS_REJECT_UNAUTHORIZED=0
```

Deploy and verify:

```bash
curl -fsS https://tt-players-api.onrender.com/api/leagues
curl -fsS https://tt-players-api.onrender.com/api/health
```

### 4. Create The Render Static Site

Create a Render Static Site from the same GitHub repository:

```text
Repository: https://github.com/wudong/tt-players
Branch: main
Root directory: .
Build command: corepack enable && pnpm install --frozen-lockfile && pnpm --filter @tt-players/mobile build
Publish path: apps/mobile/dist
```

Set environment variables:

```text
NODE_VERSION=20
VITE_API_URL=/api
```

Add this rewrite route to the static service:

```text
source: /api/*
destination: https://tt-players-api.onrender.com/api/*
type: rewrite
```

Deploy and verify:

```bash
curl -fsS https://tt-players.onrender.com/api/leagues
curl -fsS https://tt-players.onrender.com/health.json
```

### 5. Register The Custom Domain

Register `tt-players.graceliu.uk` on the Render static service.

In Cloudflare DNS, point the hostname to Render using the DNS target Render
provides for the custom domain. After DNS propagates, Render should report the
custom domain as verified.

Verify:

```bash
dig tt-players.graceliu.uk
curl -fsS https://tt-players.graceliu.uk
curl -fsS https://tt-players.graceliu.uk/health.json
curl -fsS https://tt-players.graceliu.uk/api/health
curl -fsS https://tt-players.graceliu.uk/api/leagues
```

### 6. Configure Keep-Awake Pings

Render free web services can spin down after a period of inactivity. The next
request wakes the service again, but that cold start is user-visible. To keep the
API warm, configure an external cron ping.

Use cron-job.org:

```text
Dashboard: https://console.cron-job.org/dashboard
Job name: tt-players-api-health
Job ID: 7721638
URL: https://tt-players.graceliu.uk/api/health
Method: GET
Schedule: every 10 minutes
Expected HTTP status: 200
```

The API health URL is the important keep-awake target because it reaches the
Render web service. The frontend health URL can also be monitored, but it is a
static site and does not need a keep-awake ping.

Optional frontend monitor:

```text
Job name: tt-players-frontend-health
URL: https://tt-players.graceliu.uk/health.json
Method: GET
Schedule: every 10 minutes
Expected HTTP status: 200
```

Keep the interval below Render's idle timeout. Ten minutes was chosen because it
is comfortably below the observed 15 minute spin-down window without creating
meaningful load.

## Post-Deploy Verification

Run these checks after every deployment:

```bash
for url in \
  https://tt-players.graceliu.uk/health.json \
  https://tt-players-api.onrender.com/api/health \
  https://tt-players.onrender.com/api/health \
  https://tt-players.graceliu.uk/api/health \
  https://tt-players.graceliu.uk/players/00000000-0000-0000-0000-000000000000 \
  https://tt-players-api.onrender.com/api/leagues \
  https://tt-players.graceliu.uk/api/leagues
do
  printf "%s " "$url"
  tmp=$(mktemp)
  curl -sS -o "$tmp" -w "%{http_code} %{content_type}" --max-time 45 "$url"
  node -e "const fs=require('fs'); const x=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(Array.isArray(x.data) ? ' items=' + x.data.length : ' status=' + x.status)" "$tmp"
  rm -f "$tmp"
done
```

Expected result:

```text
health URLs: 200
league URLs: 200 application/json; charset=utf-8 items=192
```

Check that the frontend bundle does not hardcode the API service hostname:

```bash
html=$(curl -sS https://tt-players.graceliu.uk)
js=$(printf '%s' "$html" | rg -o '/assets/index-[^" ]+\.js' | head -1)
curl -sS "https://tt-players.graceliu.uk$js" | node -e "
let s='';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  console.log({
    hasApiSubdomain: s.includes('tt-players-api.onrender.com'),
    hasSlashApi: s.includes('/api'),
  });
});
"
```

Expected result:

```text
{ hasApiSubdomain: false, hasSlashApi: true }
```

## Provider Inspection Commands

Render:

```bash
render services --output json

API_KEY=$(awk '/key:/ {print $2; exit}' ~/.render/cli.yaml)
curl -H "Authorization: Bearer $API_KEY" \
  https://api.render.com/v1/services/srv-d8etg0cp3tds738vh8v0/routes
curl -H "Authorization: Bearer $API_KEY" \
  https://api.render.com/v1/services/srv-d8etg0cp3tds738vh8v0/custom-domains
```

Aiven:

```bash
avn service list --project "$AIVEN_PROJECT"
avn service get tt-players-db --project "$AIVEN_PROJECT"
avn service connection-info tt-players-db --project "$AIVEN_PROJECT"
```

Cloudflare:

```bash
wrangler whoami
dig NS graceliu.uk
dig tt-players.graceliu.uk
```

## Retired Deployment Files

The old Netlify/Terraform deployment path has been removed because it no longer
matches production:

- `infra/terraform/`
- `netlify.toml`
- `netlify/functions/api.ts`

The retired Terraform described a Netlify deployment and an older Aiven region
and plan. Keeping it would make future deployment work error-prone. The current
reference implementation is this document plus the Render/Aiven/Cloudflare
provider configuration.
