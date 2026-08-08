# AGENTS.md — Table Tennis Aggregator

## Project Overview

A Postgres-maximalist ETL pipeline that scrapes UK table tennis league websites (TT Leagues, TT365), aggregates results, and serves them via a Fastify API.

## Architecture

- **Monorepo:** pnpm workspaces
- **Language:** TypeScript (strict mode), Node.js 18+
- **Database:** PostgreSQL 15 (single source of truth — data, job queue, scheduling)
- **Query Builder:** Kysely (type-safe SQL, no ORM)
- **Job Queue:** Graphile Worker (Postgres-native, `LISTEN/NOTIFY`)
- **API:** Fastify
- **Frontend:** React + Vite + TanStack Query + Tailwind CSS

## Workspace Structure

```
apps/api/        → Fastify REST API (reads clean data)
apps/worker/     → Graphile Worker (ETL scraping + parsing jobs)
packages/db/     → Shared Kysely database layer, migrations, types
```

## Key Commands

```bash
docker compose up -d           # Start PostgreSQL 15
pnpm db:migrate                # Run all Kysely migrations
pnpm db:migrate:down           # Roll back one migration
pnpm test                      # Run Vitest integration tests
```

## Database

- **Schema:** See `docs/schema.md` for full table/enum definitions
- **Migrations:** `packages/db/src/migrations/` — numbered TypeScript files
- **Types:** `packages/db/src/types.ts` — exported Kysely interfaces + enum unions
- **Connection:** Configured via `DATABASE_URL` env var (loaded with dotenv)

## Coding Conventions

- All database interactions use **Kysely** (no raw SQL except in migrations for enums/partial indexes)
- Bulk writes use **UPSERT** (`INSERT ... ON CONFLICT DO UPDATE`) wrapped in transactions
- Every table with external data has a `UNIQUE(parent_id, external_id)` constraint for deduplication
- Soft deletes via nullable `deleted_at` columns
- UUIDs for all primary keys (`gen_random_uuid()`)

## TDD Approach

Tests are written **before** implementation code. Integration tests run against a real Postgres instance (Docker), not mocks. The test suite creates/drops a `tt_players_test` database automatically.

## UI Pull Requests and Playwright Review

Every pull request that materially changes the mobile UI must include one focused Playwright scenario for that PR.

The PR screenshot pipeline deliberately does **not** run every historical UI-review scenario. Deploying a preview, preparing Playwright, and publishing the report already have a fixed cost; running all old scenarios adds unrelated screenshots, slower feedback, and live-API timing failures that make the current change harder to review. A PR-specific scenario should instead exercise the exact changed flow, assert the important behaviour and layout, and capture only the screenshots needed to judge that PR.

Required agent workflow for a UI PR:

1. Create a descriptive `*.pw.ts` scenario under `apps/mobile/tests/ui-review/` for the current PR.
2. Cover every materially changed user flow in that file. Use relevant API responses or stable rendered state as readiness signals rather than relying mainly on fixed sleeps.
3. Add functional and responsive-layout assertions before screenshots. A screenshot alone is not sufficient verification.
4. Capture only views relevant to the PR and write them through the existing UI-review manifest/report mechanism.
5. Update `playwright.ui-review.config.ts` so `testMatch` points only to the current PR's scenario filename.
6. Remove the previous PR's filename from `testMatch`; do not append multiple old PR scenarios and do not restore a wildcard such as `**/*.pw.ts` for the PR pipeline.
7. Keep previous scenario files in the repository for examples and optional manual regression testing. Removing a scenario from the config does **not** mean deleting its file.
8. Confirm the focused Playwright job and generated screenshot report pass before declaring the UI PR ready for review.

The comment block in `playwright.ui-review.config.ts` is the operational source of truth for this selection convention.

## Main Deployment UI Audit

The broad application walkthrough is separate from pull-request review and frontend deployment. Run the **Main UI Audit** workflow manually from GitHub Actions. Its `target_url` input defaults to `https://ttp.tourneypilot.com` and may be changed to another HTTPS deployment URL.

Operational rules:

1. The audit is manual and independent of deployment. Its result must not reverse or block an already successful production deployment.
2. The walkthrough captures representative anonymous root, static, player, tournament, league, team, fixture and H2H screens. Missing representative production data is recorded as skipped rather than aborting the remaining audit.
3. Authenticated coverage uses a dedicated synthetic Supabase account. Configure
   repository secrets `UI_AUDIT_EMAIL` and `UI_AUDIT_PASSWORD`; never use a
   personal account.
4. Authentication uses the public `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` repository secrets. Never expose or pass a
   Supabase service-role key to Playwright.
5. If either synthetic-user credential is absent, anonymous coverage still runs and authenticated coverage is skipped.
6. Authentication state is in-memory browser cookie state only. Do not commit it or include it in artifacts, diagnostics or screenshots beyond the account email visibly rendered by the application.
7. Browser traces remain disabled because authenticated traffic must not be retained.
8. Severe browser events are recorded with their screenshot and diagnostics. The audit continues collecting the remaining screens, then fails with a consolidated error summary.
9. Every run uploads a 30-day `main-ui-audit-<run-id>-<attempt>` artifact containing `ui-review-report/` and `test-results/main-audit/`. Open `ui-review-report/index.html` from the artifact for the screenshot report.
10. Pull requests validate the workflow contract and that the main audit test is collectable with Playwright `--list`; they do not execute the broad production walkthrough.

## CI and production credentials

Google Secret Manager in project `wudong-agent-master` is the source of truth
for confidential TT Players CI and runtime credentials. Production workflows
authenticate with workload-specific GitHub OIDC providers and load only their
explicit Secret Manager allowlists. SSH workflows use the pinned
`TT_PLAYERS_VPS_HOST_KEY` repository Variable and remove temporary private-key
and Google credential files in cleanup steps.

Fork pull requests receive no GCP or Netlify credential. Same-repository PR
previews retain the narrow GitHub-managed Netlify preview credential as the
documented isolation-preserving exception. The Main UI Audit remains on its
existing GitHub-managed credentials until a separate migration. Never pass a
secret as an SSH command-line argument or commit a value from an ignored
environment file.
