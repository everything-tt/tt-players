---
name: deployment-check
description: Check the production deployment status and generate a report. Covers Render services, Aiven database, Cloudflare DNS, API endpoints, and the static frontend. Use when the user asks to check the deployment, verify the service is up, diagnose an outage, or run a health report.
allowed-tools: Read, Bash
---

# Deployment Check & Report

Run a full deployment health check against the production stack and produce a
structured report. This skill is **read-only** — it inspects services but never
modifies configuration.

## Quick Start

```bash
bun run .agents/skills/deployment-check/scripts/check-deployment.ts
```

Reads `docs/deployment.md` as the source of truth, then runs every check
automatically and prints the report. All steps below are encapsulated in this
script — use it as the primary tool.

## Production Stack Reference

Source of truth: `docs/deployment.md`. Read it first to get the current service
IDs, URLs, and verification commands.

- **Frontend:** Render Static Site `tt-players` → `tt-players.graceliu.uk`
- **Backend API:** Render Web Service `tt-players-api` (Frankfurt, free tier)
- **Database:** Aiven PostgreSQL `tt-players-db` (do-fra, free-1-5gb)
- **DNS:** Cloudflare zone `graceliu.uk`

## Workflow

### Step 1: Read Deployment Doc

Read `docs/deployment.md` to get the current service IDs, URLs, and any recent
incidents. The service IDs and `.onrender.com` hostnames change when services are
recreated, so always read the doc first.

### Step 2: Check Render CLI

```bash
render services --output json
```

Verify both services are `"suspended": "not_suspended"`. If missing, the Render
CLI may not be authenticated — note this in the report.

### Step 3: Get Deploy Status

For each Render service, get the latest deploy:

```bash
render deploys list <service-id> --output json | python3 -c "
import json, sys
data = json.load(sys.stdin)
latest = data[0]
print(f'Status: {latest[\"status\"]}')
print(f'Commit: {latest[\"commit\"][\"message\"][:80]}')
print(f'Finished: {latest[\"finishedAt\"]}')
"
```

### Step 4: Health Endpoint Smoke Test

Run every URL in the verification checklist from the deployment doc. Include:

| URL | Purpose |
|-----|---------|
| `https://tt-players.graceliu.uk/health.json` | Frontend static health |
| `https://<api-url>/api/health` | API lightweight health |
| `https://<api-url>/api/health/db` | API database health |
| `https://tt-players.graceliu.uk/api/health` | API through custom domain |
| `https://tt-players.graceliu.uk/api/leagues` | Data endpoint through CD |
| `https://<static-url>/api/health` | API through static rewrite |

Use `--max-time 90` on the first request to the API web service (cold starts on
the free tier can take 60+ seconds). If the first request returns
`x-render-routing: no-server`, the API service has no running instance — mark it
as **DOWN**.

### Step 5: DNS Check

```bash
dig +short tt-players.graceliu.uk
```

The answer should include a `.onrender.com` CNAME. If it resolves to something
else, DNS is misconfigured.

### Step 6: Check Rewrite Route

Use the Render API to verify the static site's `/api/*` rewrite route:

```bash
API_KEY=$(awk '/key:/ {print $2; exit}' ~/.render/cli.yaml)
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.render.com/v1/services/<static-service-id>/routes" | \
  python3 -m json.tool
```

Verify the `/api/*` route destination matches the current API service URL from
the deployment doc. A mismatch is the most common cause of API outages.

### Step 7: Quick Data Sanity Check

```bash
curl -s --max-time 30 https://tt-players.graceliu.uk/api/players/count | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Players: {d.get(\"count\",\"?\")}')"
curl -s --max-time 30 https://tt-players.graceliu.uk/api/leagues | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Leagues: {len(d)}')"
```

### Step 8: Database Check (if Aiven CLI available)

```bash
avn service get tt-players-db --project "$AIVEN_PROJECT" 2>/dev/null
```

If the Aiven CLI is not authenticated, skip this step and note it in the report.

## Report Format

Produce a concise report in this structure:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TT Players — Deployment Health Report
  YYYY-MM-DD HH:MM UTC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Render Services
───────────────
  tt-players (static)    ✅ LIVE  | deploy: <id>
  tt-players-api (web)   ✅ LIVE  | deploy: <id>

DNS
───
  tt-players.graceliu.uk → <target>  ✅

Endpoints
─────────
  /health.json (frontend)          200 ✅
  /api/health (API direct)         200 ✅
  /api/health/db (API direct)      200 ✅
  /api/health (custom domain)      200 ✅
  /api/leagues (custom domain)     200 ✅

Rewrite Route
─────────────
  /api/* → <api-url>/api/*         ✅ MATCHES API URL

Data
────
  players: <count>
  leagues: <count>

Issues Found
────────────
  (list any failures or warnings here, or "None ✅")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Cold-Start Awareness

The Render API service is on the free tier and spins down after ~15 minutes of
inactivity. The first request after spin-down can take 60+ seconds to return. Use
`--max-time 90` for the first API request. Subsequent requests will be fast.

If all endpoints are 200 but the first request was slow, note it as:

```
  ⚠️  Cold start detected (first request took ~Xs)
```

This is expected behavior, not an outage.

## Common Failure Signatures

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| API returns 404 with `x-render-routing: no-server` | Static rewrite points to wrong/deleted API hostname | Step 6 |
| API health times out (90s+) | API service crashed or can't start | Check Render deploy logs |
| API health 200 but `/health/db` 500 | Database unreachable or Aiven down | Check DATABASE_URL env var, Aiven status |
| Frontend 200 but `/api/*` 502 | API service suspended or over quota | Check Render dashboard |
| DNS doesn't resolve | Cloudflare config changed | Check Cloudflare dashboard |

## Edge Cases

- **Keep-awake cron failure:** If the cron-job.org keep-awake ping stopped
  working, the API will spin down frequently. Verify the cron job at
  `https://console.cron-job.org/dashboard` (job ID 7721638).
- **Recreated services:** If services were recently recreated, the rewrite route
  is almost certainly stale. Check Step 6 carefully.
- **Render CLI not authenticated:** Run `render login` first, or use the Render
  REST API with the API key from `~/.render/cli.yaml`.
