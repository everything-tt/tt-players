# Main Deployment UI Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-blocking anonymous and authenticated Playwright screenshot walkthrough that runs after successful `main` frontend deployments.

**Architecture:** Keep the focused PR screenshot pipeline untouched. Add a separate Playwright config and audit scenario, reuse the existing HTML/manifest reporting pattern, and add a `main`-only post-deploy GitHub Actions job. Authenticate a dedicated synthetic user directly through Supabase Auth and mirror the application's chunked cookie storage contract.

**Tech Stack:** TypeScript, Playwright 1.54, React/Vite, Supabase Auth, GitHub Actions, Netlify.

## Global Constraints

- Run only after successful `main` deployment.
- The audit must be non-blocking through `continue-on-error: true`.
- Do not alter `playwright.ui-review.config.ts` or the focused PR scenario selection convention.
- Never use or expose a Supabase service-role key.
- Never persist authentication state in Git, uploaded artifacts, screenshots or diagnostics.
- Missing production entity data records a skipped screen and does not abort remaining coverage.
- Missing audit credentials skips only authenticated coverage.

---

### Task 1: Supabase audit authentication helper

**Files:**
- Create: `apps/mobile/tests/main-audit/supabase-audit-auth.ts`
- Test: `apps/mobile/tests/main-audit/supabase-audit-auth.test.ts`

**Interfaces:**
- Produces: `buildSupabaseStorageKey(supabaseUrl: string): string`
- Produces: `chunkStoredSession(storageKey: string, serializedSession: string, chunkSize?: number): Array<{ name: string; value: string }>`
- Produces: `signInSyntheticUser(page: Page, options: SyntheticUserOptions): Promise<void>`

- [ ] **Step 1: Write failing unit tests** for project-ref storage key derivation, unchunked values, chunked values and deterministic chunk names.
- [ ] **Step 2: Run** `pnpm --filter @tt-players/mobile test -- apps/mobile/tests/main-audit/supabase-audit-auth.test.ts` and confirm failure because the helper does not exist.
- [ ] **Step 3: Implement minimal pure helpers** and a Playwright login function that posts to `${supabaseUrl}/auth/v1/token?grant_type=password`, validates the token response, serializes the session and writes secure SameSite=Lax cookies for the current preview host.
- [ ] **Step 4: Run the focused unit test** and confirm it passes.
- [ ] **Step 5: Commit** with `test(ui): add synthetic Supabase audit login`.

### Task 2: Main deployment click-through scenario

**Files:**
- Create: `apps/mobile/tests/main-audit/main-audit.pw.ts`
- Reuse: `apps/mobile/src/ui-review-routes.ts`

**Interfaces:**
- Consumes: `signInSyntheticUser(page, options)` from Task 1.
- Produces: `ui-review-report/manifest.json`, screenshots, diagnostics and `index.html`.

- [ ] **Step 1: Write the anonymous audit test first** so it fails until screenshot/report helpers and route traversal are implemented.
- [ ] **Step 2: Run** `PREVIEW_URL=http://127.0.0.1:7474 pnpm --filter @tt-players/mobile exec playwright test --config=../../playwright.main-audit.config.ts` and confirm the expected missing-config failure.
- [ ] **Step 3: Implement reusable capture/report helpers** based on the existing UI-review scenario, with diagnostics redaction for token, key, secret, auth and code query parameters.
- [ ] **Step 4: Implement deterministic root/static coverage** for `/tabs/home`, `/tabs/players`, `/tabs/leagues`, `/tabs/events`, `/tabs/h2h`, `/about`, `/data-coverage`, `/design-system` and `/tabs/home/ratings`.
- [ ] **Step 5: Implement representative entity discovery** by collecting same-origin application links after root pages render, classifying paths for player, event, league, team and fixture screens, then adding player subpages from the discovered player ID.
- [ ] **Step 6: Record missing entity types as skipped manifest entries** without aborting remaining routes.
- [ ] **Step 7: Add the authenticated test**. Skip it when either credential is absent; otherwise authenticate, reload, open the menu, assert `Signed in`, the configured email and `Sign out`, capture the drawer, then repeat routes whose rendering can depend on account data.
- [ ] **Step 8: Run the scenario against a local or deployed target** and confirm anonymous coverage completes; confirm authenticated coverage skips cleanly without secrets.
- [ ] **Step 9: Commit** with `test(ui): add main deployment walkthrough`.

### Task 3: Dedicated Playwright config

**Files:**
- Create: `playwright.main-audit.config.ts`

**Interfaces:**
- Selects: `apps/mobile/tests/main-audit/main-audit.pw.ts`
- Consumes: `PREVIEW_URL`, `UI_REVIEW_REPORT_DIR`, `UI_AUDIT_EMAIL`, `UI_AUDIT_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1: Add config-validation assertions to the scenario** for required `PREVIEW_URL` and valid positive route limits.
- [ ] **Step 2: Run Playwright with the config path** and confirm failure because the config file does not yet exist.
- [ ] **Step 3: Create the config** with one Pixel 5 project, serial execution, one worker, one retry, trace retention on failure and the existing HTML/list reporter pattern.
- [ ] **Step 4: Run `pnpm --filter @tt-players/mobile exec playwright test --config=../../playwright.main-audit.config.ts --list`** and confirm only the main-audit scenario is selected.
- [ ] **Step 5: Commit** with `test(ui): configure main deployment audit`.

### Task 4: Main-only non-blocking workflow job

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `needs.build-deploy.outputs.deploy_url`.
- Produces: GitHub artifact `main-ui-audit-${{ github.sha }}`, Netlify report alias `ui-audit-main`, and a GitHub Actions job-summary link.

- [ ] **Step 1: Add a workflow contract test** in `scripts/__tests__/main-ui-audit-workflow.test.mjs` that reads `build.yml` and asserts main-only condition, `needs: build-deploy`, job-level `continue-on-error: true`, the dedicated config command, `if: always()` report upload and no PR-comment step in the main audit job.
- [ ] **Step 2: Run** `node --test scripts/__tests__/main-ui-audit-workflow.test.mjs` and confirm failure because the job is absent.
- [ ] **Step 3: Add the `main-ui-audit` job** using the existing self-hosted Playwright runner, dependency installation, Chromium installation, deployment readiness polling, report cleanup, audit command, artifact upload, Netlify report deployment and `$GITHUB_STEP_SUMMARY` output.
- [ ] **Step 4: Pass only public Supabase project configuration and synthetic-user credentials as environment variables**; do not pass a service-role secret.
- [ ] **Step 5: Run the workflow contract test** and confirm it passes.
- [ ] **Step 6: Commit** with `ci: audit deployed main UI`.

### Task 5: Documentation and verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-08-02-main-deployment-ui-audit-design.md` only if implementation details differ.

**Interfaces:**
- Documents required repository secrets and operational behaviour.

- [ ] **Step 1: Add operational documentation** explaining that PR screenshots remain focused, main audit is non-blocking, and authenticated coverage requires `UI_AUDIT_EMAIL` and `UI_AUDIT_PASSWORD` for a dedicated Supabase account.
- [ ] **Step 2: Run** `pnpm --filter @tt-players/mobile test`.
- [ ] **Step 3: Run** `pnpm --filter @tt-players/mobile build`.
- [ ] **Step 4: Run** `node --test scripts/__tests__/main-ui-audit-workflow.test.mjs`.
- [ ] **Step 5: Run** `pnpm --filter @tt-players/mobile exec playwright test --config=../../playwright.main-audit.config.ts --list`.
- [ ] **Step 6: Review generated diff for credential leakage and confirm no state file is tracked or uploaded.**
- [ ] **Step 7: Commit** with `docs: explain main UI audit setup`.

## Self-review

- Spec coverage: trigger, non-blocking behaviour, separate PR config, anonymous/authenticated passes, synthetic-user login, secret handling, representative entity routes, skip behaviour, diagnostics and report publication are each assigned to a task.
- Placeholder scan: no implementation step contains TBD/TODO placeholders.
- Type consistency: Task 2 consumes the exact `signInSyntheticUser(page, options)` interface introduced in Task 1; Task 3 selects the exact scenario created in Task 2.
