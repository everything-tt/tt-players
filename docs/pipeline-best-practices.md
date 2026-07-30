# Pipeline Best Practices

> Updated: 2026-07-30

This project uses GitHub Actions for pull-request validation and production
deployment. The goal is to run the checks that protect the changed surface
without spending CI time on unrelated parts of the monorepo.

## Principles

- Use path filters for every automatic workflow.
- Validate pull requests before merge; deploy only from `main`.
- Keep CI runtime versions aligned with production.
- Keep preview environments only where they are useful.
- Prefer explicit package checks over broad root commands when the root script
  does not cover the whole changed surface.

## Frontend

Workflows:

- `.github/workflows/mobile-ci.yml`
- `.github/workflows/build.yml`

Rules:

- Run frontend CI only for `apps/mobile`, `packages/design-system`, package
  metadata, lockfile, workspace, or workflow changes.
- Keep Netlify PR previews because they are useful for UI review.
- Keep Netlify production deploys restricted to `main`.
- Use Node 22 to match the production runtime family.

Expected PR behavior:

- Frontend code changes run `Mobile CI`.
- Frontend code changes also run `Build and Deploy Frontend` to create/update a
  Netlify preview.
- Docs-only changes do not run frontend workflows.

## Backend

Workflows:

- `.github/workflows/backend-ci.yml`
- `.github/workflows/vps-deploy.yml`

Rules:

- Backend PRs run validation but do not create preview deployments.
- Production deployment runs only after relevant changes land on `main`.
- CI PostgreSQL must match the production major version. Production currently
  uses PostgreSQL 18, so workflows use `postgres:18`.
- Backend validation must cover DB, API, and worker packages.

Expected PR behavior:

- API, worker, DB, infra, migration script, package metadata, lockfile,
  workspace, or backend workflow changes run `Backend CI`.
- Docs-only changes do not run backend workflows.

Expected `main` behavior:

- Backend-relevant changes run `Deploy API and Database to VPS`.
- The deploy workflow typechecks API and worker code, runs DB/API/worker tests,
  rsyncs the release, migrates PostgreSQL, restarts services, and checks API
  health.

## Version Alignment

Keep these aligned unless there is a documented reason to diverge:

| Runtime | Target |
| --- | --- |
| Node.js in CI | 22 |
| Node.js on VPS | 22 |
| PostgreSQL in backend CI/deploy tests | 18 |
| PostgreSQL on VPS | 18 |
| pnpm | pinned by `packageManager` in `package.json` |

## Path Filter Checklist

When adding a workflow, include only the relevant source paths plus the files
that can change dependency or workflow behavior:

```yaml
paths:
  - 'apps/<app>/**'
  - 'packages/<shared-package>/**'
  - 'package.json'
  - 'pnpm-lock.yaml'
  - 'pnpm-workspace.yaml'
  - '.github/workflows/<workflow>.yml'
```

Include shared workflow files when changing them should validate the affected
pipeline.

## Test Command Checklist

Frontend:

```bash
pnpm mobile:build
pnpm --filter @tt-players/mobile test -- --passWithNoTests
```

Backend:

```bash
pnpm --filter @tt-players/api... build
pnpm --filter @tt-players/worker build
pnpm --filter @tt-players/db test
pnpm --filter @tt-players/api test
pnpm --filter @tt-players/worker test -- --passWithNoTests
```

## Deployment Separation

- PR workflows validate code and, for frontend only, create preview deployments.
- `main` workflows deploy production.
- Do not deploy backend previews unless there is a clear operator need and a
  defined database/data isolation model.
