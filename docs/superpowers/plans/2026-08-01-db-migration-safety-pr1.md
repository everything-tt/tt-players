# Database Migration Safety PR1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a failed production migration from leaving TT Players offline and ensure CI executes every repository migration through the real production migrator.

**Architecture:** Add a small shell helper that owns the stop-run-recover lifecycle for services around a migration command. The VPS deploy script delegates migration execution to that helper, so a non-zero migration exit immediately restarts the currently deployed API and worker before the deployment fails. Add an integration test that creates a fresh PostgreSQL database, runs `src/migrate.ts` through `tsx`, and compares the Kysely migration table with every migration file on disk.

**Tech Stack:** Bash, Node.js test runner, TypeScript, Vitest, PostgreSQL 18 in GitHub Actions, Kysely, pnpm.

## Global Constraints

- Work on `agent/db-migration-safety-pr1`, never directly on `main`.
- Keep migrations forward-only; do not add automatic database restore or down-migration behavior.
- Restart only the already deployed `ttp-api` and `ttp-worker` services when the migration command fails.
- Preserve the migration command's original non-zero exit status.
- Exercise the same `packages/db/src/migrate.ts` entry point used by production.
- Do not add dependencies.

---

### Task 1: Add failing service-recovery regression tests

**Files:**
- Create: `scripts/__tests__/service-recovery.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Bash executable and a future `scripts/lib/service-recovery.sh` file.
- Produces: Required behavior for `run_with_service_recovery <service...> -- <command...>`.

- [ ] **Step 1: Add a Node test that runs a failing fake migration**

Create temporary fake `systemctl` and migration executables. Source `scripts/lib/service-recovery.sh`, invoke `run_with_service_recovery ttp-worker ttp-api -- <fake-migration>`, and assert:

```text
exit status = 42
systemctl calls =
  stop ttp-worker ttp-api
  restart ttp-worker ttp-api
```

- [ ] **Step 2: Add a success-path test**

Assert a zero-exit migration produces only:

```text
stop ttp-worker ttp-api
```

- [ ] **Step 3: Ensure the root Node test command discovers all script tests**

Change:

```json
"test:performance-tools": "node --test scripts/__tests__/performance-tools.test.mjs"
```

to:

```json
"test:performance-tools": "node --test scripts/__tests__/*.test.mjs"
```

- [ ] **Step 4: Run the script tests and verify RED**

Run:

```bash
pnpm run test:performance-tools
```

Expected: the new tests fail because `scripts/lib/service-recovery.sh` does not exist.

---

### Task 2: Implement service recovery and integrate deployment

**Files:**
- Create: `scripts/lib/service-recovery.sh`
- Modify: `scripts/deploy-vps-release.sh`
- Modify: `.github/workflows/backend-ci.yml`
- Modify: `.github/workflows/vps-deploy.yml`

**Interfaces:**
- Produces: `run_with_service_recovery <service...> -- <command...> -> command exit status`.
- Uses: `SYSTEMCTL_BIN`, defaulting to `systemctl`, so tests can inject a fake executable.

- [ ] **Step 1: Implement the minimal helper**

The helper must:

```bash
run_with_service_recovery ttp-worker ttp-api -- migration-command args...
```

1. stop the listed services, tolerating stop failures;
2. execute the command;
3. return zero without restarting when the command succeeds;
4. restart the same services, tolerating restart failures, when the command fails;
5. return the migration command's original status.

- [ ] **Step 2: Replace the deployment script's direct stop-and-migrate block**

Source the helper from the release directory and wrap the existing PostgreSQL migration command with `run_with_service_recovery`. Keep release symlink activation after successful migration only.

- [ ] **Step 3: Add shell syntax validation**

Both backend and deployment workflows must run:

```bash
bash -n scripts/lib/service-recovery.sh
bash -n scripts/deploy-vps-release.sh
bash -n scripts/rollback-vps-release.sh
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm run test:performance-tools
bash -n scripts/lib/service-recovery.sh
bash -n scripts/deploy-vps-release.sh
```

Expected: all commands exit zero.

---

### Task 3: Add a complete migration-chain integration test

**Files:**
- Create: `packages/db/src/__tests__/migration-chain.integration.test.ts`

**Interfaces:**
- Consumes: PostgreSQL admin URL `postgres://postgres:postgres@localhost:5432/postgres` and production migrator `packages/db/src/migrate.ts`.
- Produces: CI proof that every numbered migration file is executed and recorded in `kysely_migration`.

- [ ] **Step 1: Create and clean an isolated test database**

Use database name `tt_players_migration_chain_test`. Drop/create it before the test, terminate remaining connections, and drop it afterward.

- [ ] **Step 2: Run the production migration entry point**

Spawn:

```bash
pnpm exec tsx src/migrate.ts
```

from `packages/db` with `DATABASE_URL` pointing at the isolated database. Assert exit status zero and include stdout/stderr in a failure message.

- [ ] **Step 3: Compare disk migrations with executed migrations**

Read `packages/db/src/migrations`, keep numbered `.ts` files, remove extensions, sort them, then query:

```sql
SELECT name FROM kysely_migration ORDER BY timestamp ASC, name ASC
```

Assert the executed list exactly equals the migration-file list. This automatically fails whenever a future migration is not exercised.

- [ ] **Step 4: Run the database test and verify GREEN**

Run:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable \
  pnpm --filter @tt-players/db test
```

Expected: migration-chain test and existing DB tests pass.

---

### Task 4: Verify and publish

**Files:**
- Review all files changed by Tasks 1–3.

- [ ] **Step 1: Run the full backend gate**

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable \
  pnpm run check:backend
```

Expected: exit zero.

- [ ] **Step 2: Review the branch diff**

Confirm there are no database schema changes, no production secrets, and no unrelated UI changes.

- [ ] **Step 3: Open a draft pull request**

Use title:

```text
Prevent migration failures from leaving production offline
```

The PR body must explain the outage root cause, service restart behavior, complete migration-chain test, and validation evidence.
