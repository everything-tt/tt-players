# TT Players Full-Codebase Engineering and Security Audit

**Repository:** `wudong/tt-players`  
**Branch reviewed:** `main`  
**Reviewed commit:** `9a287899de3cf43bfd6909313ba8cff04e562c18`  
**Audit date:** 6 August 2026  
**Audit type:** Static full-codebase engineering, security, performance, CI/CD, and infrastructure review

> [!NOTE]
> This review was based on repository source and configuration at the reviewed commit. It did not include live penetration testing, production traffic analysis, production `EXPLAIN ANALYZE` plans, runtime heap profiling, or a current dependency-CVE scan. Line references may move after subsequent changes; file paths and function names are the durable references.

---

## 1. Executive Summary

TT Players is a TypeScript pnpm monorepo built around:

- A Fastify REST API.
- A Graphile Worker ETL and scraping service.
- PostgreSQL as the primary datastore, job queue, cache store, and read-model platform.
- Kysely for typed database access.
- A React/Vite PWA using TanStack Query and Supabase authentication.
- A shared UI design-system package.
- Netlify for frontend delivery and a VPS/systemd deployment for the API, worker, and PostgreSQL services.

### Overall code health: **64/100**

| Area | Score | Assessment |
|---|---:|---|
| Architecture and modularity | 15/20 | Strong service boundaries, but oversized route modules and shared “god” files |
| Correctness and testing | 16/20 | Extensive integration and query-shape tests; several account-sync correctness gaps |
| Security | 9/25 | Multiple serious trust-boundary problems involving authentication, scraping, TLS, CI, and deployment |
| Performance and scalability | 12/20 | Good timeouts and caching, but expensive cold-cache paths and write amplification remain |
| Operations and maintainability | 12/15 | Mature deployment and recovery design, with configuration drift and supply-chain weaknesses |
| **Total** | **64/100** | Good engineering foundation, but not yet security-hardened |

### Principal strengths

The repository has unusually good operational discipline for a project of this size:

- Clear macro-level separation between API, ETL worker, frontend, database package, and design system.
- Consistent use of Zod schemas and Kysely parameterized queries.
- API request, query, lock, connection, and shutdown timeouts.
- Graceful API and worker shutdown.
- Authorization-header log redaction.
- Bounded multipart file counts and image signature validation.
- Comprehensive API integration, worker parser, database migration, query-shape, mobile, and Playwright coverage.
- systemd hardening including `NoNewPrivileges`, `PrivateTmp`, `ProtectHome`, and `ProtectSystem`.

Several findings from the June 2026 database audit have already been addressed. In particular, player identity resolution is now a single SQL query, and leaderboard aggregation, ranking, filtering, and limiting are performed in PostgreSQL rather than JavaScript.

### Principal risks

The largest deductions arise from:

1. Supabase bearer and refresh tokens stored in JavaScript-readable cookies shared across every `*.tourneypilot.com` subdomain.
2. A scraper flow that may transmit source cookies and an anti-forgery token to an attacker-controlled or internal URL.
3. Shared-browser account data crossing from one signed-in user to another.
4. PostgreSQL TLS encryption configured without certificate verification.
5. Deployment SSH trust established dynamically using `ssh-keyscan`.
6. Public feedback and expensive API routes without application-level rate limiting.
7. Pull-request code executed on a persistent self-hosted runner in a job that later performs secret-bearing deployment steps.
8. Expensive full-career analytics and repeated rubber-table scans on cache misses.

The overall assessment is therefore: **well-engineered application code with a good testing culture, but several high-impact security boundaries need redesign rather than incremental patching.**

---

## 2. Architecture and Design Patterns

### 2.1 Architecture evaluation

The top-level architecture is appropriate:

```text
apps/mobile
    React/Vite PWA
        |
        v
apps/api
    Fastify REST API
        |
        v
packages/db
    Kysely/PostgreSQL
        ^
        |
apps/worker
    Graphile Worker + scrapers + transformations
```

PostgreSQL being used for durable source data, normalized entities, read models, cache entries, and Graphile jobs simplifies consistency and operations. It avoids introducing Redis or a separate queue before there is a demonstrated need.

The division between `apps/api`, `apps/worker`, `apps/mobile`, `packages/db`, and `packages/design-system` is clean and understandable.

### 2.2 Positive design patterns

#### Typed boundary validation

Fastify routes use Zod schemas for query strings, parameters, bodies, and responses. Kysely and tagged SQL templates are used instead of string concatenation. No obvious SQL-injection path was identified in the reviewed routes.

#### ETL durability and idempotency

Graphile Worker provides durable PostgreSQL-backed jobs. Stable job keys, retry policies, payload hashes, and upserts reduce duplicate ingestion.

#### Defensive API configuration

The API establishes body limits, request timeouts, compression thresholds, cache policies, error sanitization, and database timeouts.

Relevant files:

- `apps/api/src/app.ts`
- `apps/api/src/db.ts`
- `apps/api/src/server.ts`

#### Focused UI verification

The repository distinguishes PR-specific screenshot review from broad production UI audits. That is a good balance between relevant review feedback and regression coverage.

Relevant files:

- `AGENTS.md`
- `.github/workflows/build.yml`
- `.github/workflows/main-ui-audit.yml`
- `playwright.ui-review.config.ts`
- `playwright.main-audit.config.ts`

### 2.3 Structural anti-patterns

#### A. Route modules contain too many responsibilities

Notable production module sizes at the reviewed commit include:

- `apps/api/src/routes/players.ts`: approximately 112 KB.
- `apps/api/src/routes/leagues.ts`: approximately 42 KB.
- `apps/api/src/routes/h2h-analysis.ts`: approximately 32 KB.
- `apps/api/src/routes/events.ts`: approximately 25 KB.

`players.ts` currently contains:

- Request and response schemas.
- Cursor encoding.
- Identity resolution.
- Cache access.
- Cache-version computation.
- Large SQL statements.
- Domain calculations.
- Presentation mapping.
- Route registration.

This makes query reuse, isolated performance testing, and security review harder.

A preferable feature structure would be:

```text
features/players/
  player.schemas.ts
  player.repository.ts
  player.service.ts
  player.cache.ts
  player.presenters.ts
  player.routes.ts
```

#### B. `player-shared.ts` is a frontend god module

`apps/mobile/src/player-shared.ts` combines:

- API DTO definitions.
- Local-storage keys.
- Navigation metadata.
- Fetch helpers.
- Error presentation.
- Favourites validation.
- Tournament aggregation.
- Miscellaneous UI utilities.

This file has become a broad coupling point. Changes to API contracts, navigation, persistence, or UI helpers all affect the same module.

#### C. Database package has module-level side effects

`packages/db/src/database.ts` exports both `createDb()` and a singleton `db`. Importing the runtime export requires `DATABASE_URL` and creates a pool during module evaluation. The package index then re-exports this singleton.

Consequences include:

- Hidden resource allocation at import time.
- Harder unit testing.
- Accidental duplicate pools.
- Inability to import certain runtime utilities without valid database configuration.
- Blurred ownership of connection shutdown.

Use dependency injection at application entry points and keep `packages/db` free of a globally instantiated pool.

#### D. API contracts are duplicated

The API defines Zod response schemas while the mobile application separately defines TypeScript interfaces. These may drift without a compile-time failure across workspaces.

Introduce a shared package containing only transport contracts:

```text
packages/contracts/
  players.ts
  leagues.ts
  events.ts
  sync.ts
```

Zod schemas can be exported with inferred TypeScript types for both API and frontend use.

#### E. Frontend route loading is fully eager

`apps/mobile/src/AppRouter.tsx` imports every main page, detail page, data-quality screen, and rating-audit screen at startup. There is no route-level `React.lazy()` or dynamic import.

The public user bundle therefore includes code for infrequently used administrative and rating-audit screens.

#### F. Environment and dependency drift

Current contracts differ across environments:

- Local Docker and documentation target PostgreSQL 15.
- Backend CI runs PostgreSQL 18.
- `package.json` permits Node 18+, but CI validates only Node 22.
- API uses Zod 3 while worker uses Zod 4.
- Production executes TypeScript directly through `tsx`, rather than deploying compiled immutable artifacts.

None is immediately fatal, but together they increase the chance of environment-specific failures.

---

## 3. Critical Vulnerabilities and Bugs

## 3.1 Critical: Supabase tokens exposed across all sibling subdomains

**Locations**

- `apps/mobile/src/lib/crossDomainAuthStorage.ts`
  - `SHARED_DOMAIN`
  - `writeCookie()`
  - `setItem()`
- `apps/mobile/src/lib/auth.ts`
  - Supabase client storage configuration

The Supabase session is stored in cookies configured with:

```text
Domain=.tourneypilot.com
Path=/
Secure
SameSite=Lax
JavaScript-readable
```

The storage implementation explicitly acknowledges that the cookies are not `HttpOnly`. The Supabase client persists both session and refresh-token material using this storage.

### Impact

Any JavaScript execution on any sibling subdomain can read or overwrite the parent-domain cookie. Therefore:

- An XSS vulnerability in one TourneyPilot-family application compromises sessions for every application using this shared session.
- A forgotten, abandoned, or third-party-hosted sibling subdomain becomes part of the TT Players authentication boundary.
- A compromised sibling can steal refresh tokens and retain access beyond the short lifetime of an access token.
- A sibling can overwrite the cookie and create session-confusion or forced-account-switch attacks.

This turns a single-origin frontend compromise into a parent-domain account takeover.

### Required correction

Do not share bearer or refresh tokens through parent-domain JavaScript-readable cookies.

Use either:

1. Host-only Supabase storage for each application; or
2. A central authentication broker that performs a short-lived, one-time authorization-code exchange; or
3. A backend-for-frontend using host-only `Secure`, `HttpOnly`, `SameSite` cookies.

A parent-domain refresh-token cookie should not remain part of the design.

---

## 3.2 Critical: Scraper can transmit cookies and anti-forgery token to an arbitrary host

**Locations**

- `apps/worker/src/tasks/scrapeUrlTask.ts`
  - `extractAjaxMatchCardPath()`
  - `extractAndStoreTT365MatchCard()`
- `apps/worker/src/tt365-http.ts`
  - `isTT365Url()`
  - `fetchWithTT365Policy()`

The TT365 match-card flow extracts an AJAX URL from remote HTML:

```ts
const ajaxUrl = new URL(ajaxPath, url).toString();
```

The extracted value can be an absolute URL. The worker then forwards:

- Cookies collected from the original page response.
- The source anti-forgery token.
- The original URL as `Referer`.

The fetch policy treats non-TT365 destinations as ordinary URLs and sends them directly without an allowlist. Native fetch redirects are also followed without validating the destination after each redirect.

### Impact

A compromised or malicious source page can cause the worker to:

- POST source cookies and the anti-forgery token to an attacker.
- Access private network services reachable by the VPS.
- Probe loopback, RFC1918, link-local, container, or cloud metadata endpoints.
- Follow a trusted public URL through a redirect to an untrusted destination.

This is a server-side request-forgery and credential-exfiltration boundary violation.

### Required correction

Before any fetch:

- Require `https:`.
- Enforce an explicit platform hostname allowlist.
- Require the AJAX destination to match the original origin or an explicitly approved origin.
- Reject URL usernames/passwords and unexpected ports.
- Resolve DNS and reject loopback, private, link-local, multicast, and metadata ranges.
- Disable automatic redirects and validate every redirect target.
- Never forward cookies or anti-forgery tokens when the destination origin differs.
- Add bounded response streaming.

---

## 3.3 High: One user can inherit another user’s local profile and journal

**Locations**

- `apps/mobile/src/UserDataSyncProvider.tsx`
- `apps/mobile/src/local-persistence.ts`
- `apps/mobile/src/lib/auth.ts`
- `apps/api/src/routes/user-sync.ts`

The synchronized browser data contains:

- Selected leagues.
- Favourite players, teams, tournaments, and H2H entries.
- Claimed player identity.
- TT profile.
- Match journal.

On sign-out, the authentication code signs out of Supabase but does not clear or partition these values. When another user signs in, the sync provider creates a snapshot from the existing browser `localStorage` and sends it to the bootstrap endpoint.

For a user without an existing server record, the API stores this browser snapshot under the newly signed-in user ID.

### Example

1. User A signs in and creates journal entries.
2. User A signs out on a shared device.
3. User B signs in for the first time.
4. The browser sends User A’s retained local snapshot during User B’s bootstrap.
5. User A’s data is written to User B’s server account.

### Impact

This violates account isolation and can disclose personal match notes and claimed player information.

### Required correction

Store authenticated local data under a user-specific namespace, such as:

```text
tt_players:{supabaseUserId}:match_journal
```

On authentication transition:

- Never bootstrap a new user from unowned shared storage.
- Migrate anonymous data only through an explicit user-confirmed import.
- Clear the active user projection on sign-out.
- Add an integration test covering A → sign-out → B.

---

## 3.4 High: PostgreSQL TLS certificate verification is disabled

**Locations**

- `packages/db/src/database.ts`
- `apps/worker/src/worker.ts`

Both database pools use:

```ts
ssl: connectionString.includes('sslmode=require')
  ? { rejectUnauthorized: false }
  : undefined
```

This encrypts traffic but does not authenticate the PostgreSQL server certificate.

### Impact

A network-positioned attacker may impersonate the database server, capture credentials, and read or alter database traffic.

### Required correction

- Install the expected provider or private CA certificate.
- Set `rejectUnauthorized: true`.
- Prefer `sslmode=verify-full`.
- Fail startup when production TLS verification cannot be established.
- Do not silently downgrade production connections to unverified TLS.

---

## 3.5 High: VPS SSH identity is trusted dynamically during deployment

**Location**

- `.github/workflows/vps-deploy.yml`
  - `Configure SSH` step

The workflow runs:

```bash
ssh-keyscan -H "$VPS_HOST" >> ~/.ssh/known_hosts
```

It then uses that newly obtained key to transmit deployment files and authentication configuration, including Supabase and Cloudflare credentials.

### Impact

DNS poisoning or a network interception during deployment can cause the workflow to trust an attacker-controlled SSH server.

### Required correction

Store the expected host public key or fingerprint as a protected secret or repository variable, then write that exact value to `known_hosts`. Never establish trust from the same network connection being authenticated.

---

## 3.6 High: Feedback proxy trusts attacker-controlled forwarding headers

**Locations**

- `apps/api/src/routes/feedback.ts`
  - `forwardedFor()`
  - feedback POST handler
- `apps/api/src/app.ts`
  - Fastify construction and plugin registration

The feedback route reads the inbound `X-Forwarded-For` header and forwards its first value to the external feedback service. Fastify is not configured with a trusted-proxy policy, and there is no application-level rate limiter.

### Impact

An attacker can:

- Spoof source IPs used for upstream auditing.
- Potentially bypass upstream per-IP limits.
- Submit public feedback and attachments repeatedly.
- Consume API memory, CPU, and upstream bandwidth.

Image sizes are bounded, which limits individual requests, but abuse volume is not bounded.

### Required correction

- Configure `trustProxy` only for the actual Cloudflare/proxy network.
- Derive the client IP from Fastify’s trusted `request.ip`.
- Strip or overwrite untrusted forwarding headers.
- Add local rate limits per trusted IP and per route.
- Add maximum lengths for `name`, `message`, `page_path`, and related fields.
- Consider a bot challenge for sustained abuse.

---

## 3.7 High: Persistent self-hosted runner executes pull-request code

**Location**

- `.github/workflows/build.yml`
  - `ui-screenshots` job

Same-repository pull requests run dependency installation and Playwright code on a persistent self-hosted ARM64 runner. The same job later performs a Netlify deployment using repository secrets.

### Impact

A compromised contributor account or malicious same-repository branch may:

- Establish persistence on the runner.
- Read workspace or host data left by previous jobs.
- Leave a process that observes later steps.
- Modify generated report content.
- Attempt to capture credentials made available later in the job.

### Required correction

- Use ephemeral, single-job runners.
- Re-image the runner after every job.
- Run untrusted PR tests in a secretless job.
- Move report deployment to a separate trusted `workflow_run` job that checks the completed commit and downloads a sanitized artifact.
- Do not combine PR code execution and secret-bearing deployment in one runner lifecycle.

---

## 3.8 Medium: Account sync silently loses concurrent updates

**Locations**

- `apps/api/src/routes/user-sync.ts`
  - sync-state PUT route
- `apps/mobile/src/UserDataSyncProvider.tsx`
  - `pushLocalChanges()`

Every update replaces the complete JSON snapshot. There is no revision, ETag, `updated_at` precondition, merge operation, or conflict response.

### Impact

Two devices can perform:

1. Device A reads revision N.
2. Device B reads revision N.
3. A writes changed favourites.
4. B writes changed journal entries using its older full snapshot.
5. A’s favourites disappear.

### Required correction

Add optimistic concurrency:

- Store a monotonically increasing revision.
- Require `If-Match` or `base_revision`.
- Return `409 Conflict` when stale.
- Merge per-key updates or model high-value datasets as separate records.

---

## 3.9 Medium: Browser security headers are incomplete

**Location**

- `netlify.toml`

The frontend config sets frame, MIME-sniffing, and referrer protections, but no repository-defined:

- Content Security Policy.
- Permissions Policy.
- Cross-Origin-Opener-Policy.
- Cross-Origin-Resource-Policy.
- HSTS policy.

HSTS might be configured externally at Cloudflare, but that cannot be confirmed from the repository.

A strong CSP is particularly important while authentication tokens remain JavaScript-readable.

---

## 4. Performance and Scalability

## 4.1 Full-career analytics are loaded into Node.js memory

**Location**

- `apps/api/src/routes/players.ts`
  - `GET /:id/insights`

On an insights cache miss, the API:

1. Calculates a data version using aggregate scans.
2. Retrieves every career singles result.
3. Retrieves every career doubles result.
4. Transfers those rows to Node.js.
5. Builds yearly, monthly, league, division, score-pattern, rival, form, and streak maps in JavaScript.

There is no career-row limit.

Caching helps repeated requests, but any relevant match update invalidates the cache and makes the next request pay the complete cost.

### Recommended design

Create a player-insights read model refreshed by the worker:

```text
player_insight_snapshots
  player_id
  source_version
  career_by_year
  rivals
  form
  style
  context
  refreshed_at
```

Alternatively, calculate the aggregates in PostgreSQL and return only the final result rows.

---

## 4.2 Extended statistics scan the same match set repeatedly

**Location**

- `apps/api/src/routes/players.ts`
  - `GET /:id/stats/extended`

On a cache miss, extended statistics run independent queries for:

- Win/loss totals.
- Nemesis.
- Doubles partner.
- Current streak.

These run concurrently, which improves wall-clock latency, but they still make PostgreSQL search and aggregate overlapping rubber sets several times.

Combine them into one normalized player-match CTE followed by aggregate subqueries, or materialize a player statistics snapshot.

---

## 4.3 Cache stampedes remain possible

The cache implementation follows:

```text
read cache
  -> miss
  -> run expensive calculation
  -> upsert cache
```

There is no single-flight promise, PostgreSQL advisory lock, lease row, or stale-result refresh coordinator.

After invalidation, multiple simultaneous requests can all calculate the same leaderboard or player insight.

### Correction

Use one of:

- PostgreSQL advisory locks keyed by cache type and key.
- A `refreshing_until` lease.
- Stale-while-revalidate where one worker refreshes asynchronously.
- Precomputation from the ETL completion pipeline.

---

## 4.4 Cache-version checks are themselves aggregate queries

Leaderboard and player cache validation calculates versions using `MAX(updated_at)` across large tables and joins before checking the cache.

The repository already has data-version infrastructure. Cache invalidation should read an O(1) version row bumped by ETL transactions rather than calculate table maxima during user requests.

---

## 4.5 Scraper responses have no maximum body size

**Locations**

- `apps/worker/src/extractor.ts`
- `apps/worker/src/tasks/scrapeUrlTask.ts`

The worker calls `response.text()`, hashes the complete response, and stores it in `staging.raw_scrape_logs`. There is no `Content-Length` or streaming byte limit.

A faulty or malicious upstream can cause:

- Worker heap exhaustion.
- Very large database rows.
- Excessive hashing CPU.
- Database storage growth.
- Slow retries of the same oversized response.

Apply a compressed and decompressed byte limit, abort the stream once exceeded, and record a bounded error payload instead.

---

## 4.6 Browser sync serializes a potentially large snapshot every two seconds

**Location**

- `apps/mobile/src/UserDataSyncProvider.tsx`

The provider checks the entire synchronized `localStorage` snapshot every two seconds. Server payloads permit up to 900 KB. Even without a network write, serializing a large match journal every two seconds can consume mobile CPU and battery.

The application already emits storage and domain-specific update events. Replace polling with:

- Explicit dirty-state notifications.
- A short debounce.
- A maximum save frequency.
- Flush on visibility change and page lifecycle events.

---

## 4.7 Full-document JSONB sync creates write amplification

A small favourite change rewrites the entire synchronized JSONB document. For large journals this causes:

- Network write amplification.
- PostgreSQL TOAST churn.
- Larger WAL volume.
- Increased backup size.
- More expensive multi-device conflict handling.

Split frequently updated or high-value data into separate records, especially match-journal entries.

---

## 4.8 Supabase auth verification adds a remote dependency to every sync write

**Location**

- `apps/api/src/auth.ts`
  - `requireSupabaseUser()`

Every authenticated sync request calls Supabase’s `/auth/v1/user` endpoint with an eight-second timeout.

This introduces:

- Additional latency.
- Supabase availability dependency.
- Extra network traffic.
- A straightforward authenticated request-amplification target.

Validate JWTs locally using cached JWKS keys and normal issuer, audience, expiry, and signature checks. Retain remote validation only where immediate revocation checks are essential.

---

## 4.9 Frontend lacks route-level code splitting

All route components are eagerly imported, including rating-audit and design-system screens.

Convert non-core screens to lazy routes and measure:

- Initial JavaScript transferred.
- Parsed/compiled JavaScript.
- Largest Contentful Paint.
- Interaction to Next Paint on mid-range Android devices.

---

## 4.10 TT365 rate limiting is process-local

The TT365 request queue and next-request timestamp are module-level variables in `apps/worker/src/tt365-http.ts`.

This works with the current single worker process, but each additional process or replica receives an independent limiter. Scaling the worker can unintentionally multiply the request rate.

Use a Graphile queue name with concurrency one per source or a PostgreSQL-backed distributed lease.

---

## 5. Technical Debt and Code Smells

## 5.1 Oversized files and mixed abstractions

Priority decomposition targets:

- `apps/api/src/routes/players.ts`
- `apps/api/src/routes/leagues.ts`
- `apps/api/src/routes/h2h-analysis.ts`
- `apps/mobile/src/player-shared.ts`
- Large page components such as `EventDetailPage.tsx`

These files mix persistence, business rules, API presentation, and UI concerns.

## 5.2 Unsafe or weak typing at internal boundaries

Examples include:

- Cache values read using `any`.
- Migrations using `Kysely<any>`.
- Database JSON values parsed only at presentation time.
- Frontend API responses asserted using `as Promise<T>` rather than runtime validation.

The external boundary is validated well, but internal cache/read-model boundaries are less strongly typed.

## 5.3 Production runs TypeScript through `tsx`

Both systemd services execute source files using `tsx`.

This:

- Retains build tooling in production.
- Increases startup work.
- Makes the deployed artifact less immutable.
- Allows production behavior to depend on source resolution and workspace links.

Compile API and worker applications into versioned deployment artifacts.

## 5.4 Root quality command does not represent the whole repository

Root `pnpm test` runs backend tests only. Mobile tests run in their dedicated CI workflow, but a developer running the obvious repository-level test command receives incomplete coverage.

Use an explicit repository-wide quality command, for example:

```json
{
  "scripts": {
    "test": "pnpm -r test",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm check:design-system"
  }
}
```

## 5.5 No visible lint, dependency-audit, SAST, or secret-scanning quality gate

The reviewed workflows run builds, tests, shell syntax checks, query tooling, and UI collection, but no repository-defined:

- CodeQL workflow.
- OSV or dependency audit.
- Secret scanner.
- Semgrep-style security rules.
- General API/worker lint gate.

GitHub-level settings may provide some of these, but they are not represented in the repository.

## 5.6 GitHub Actions use mutable version tags

Examples include:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `pnpm/action-setup@v4`
- `nwtgck/actions-netlify@v3.0`

The Netlify action receives powerful tokens. Pin third-party actions to reviewed full commit SHAs and use Dependabot to update those pins.

## 5.7 Configuration contracts are inconsistent

- Node 18 is declared, Node 22 is tested.
- PostgreSQL 15 is used locally, PostgreSQL 18 in CI.
- API and worker use different Zod major versions.
- The API package `start` command runs migrations, while production systemd launches `server.ts` directly.
- Build scripts compile only the frontend, while API and worker are typechecked but not emitted.

Define one supported runtime matrix and validate it explicitly.

## 5.8 Repository noise

The source tree includes:

- Committed `.DS_Store`.
- Large checked-in screenshot directories.
- Multiple agent-skill directory variants.
- Generated source configuration files.
- Historical audit and design artifacts at repository root.

Some are useful, but production source, generated data, agent tooling, audit output, and design evidence should be more clearly separated.

---

## 6. Actionable Remediation Plan

## Critical

- [ ] **C1 — Replace parent-domain Supabase session cookies.** Move to host-only storage or a backend-for-frontend with host-only `HttpOnly` cookies. Use a one-time authorization-code exchange for cross-application SSO.
- [ ] **C2 — Revoke existing shared refresh tokens after C1 deployment.** Force reauthentication so tokens previously readable across sibling subdomains cannot remain active.
- [ ] **C3 — Add an outbound scraper URL policy.** Allow only approved HTTPS origins, validate every redirect, block private and metadata networks, and reject unexpected ports and credentials.
- [ ] **C4 — Prevent cross-origin scraper credential forwarding.** Send cookies, referer information, and anti-forgery tokens only to the exact original approved origin.
- [ ] **C5 — Add worker response-size enforcement.** Abort page and AJAX responses above a configured compressed and decompressed byte limit.
- [ ] **C6 — Add security regression tests.** Cover absolute AJAX URLs, cross-origin redirects, DNS-to-private-IP resolution, oversized bodies, and credential forwarding.

## High

- [ ] **H1 — Partition local application data by authenticated user ID.**
- [ ] **H2 — Clear or detach the active user projection during sign-out.**
- [ ] **H3 — Add a shared-browser regression test:** User A data → sign-out → User B login must not expose or upload User A data.
- [ ] **H4 — Enable verified PostgreSQL TLS.** Supply a trusted CA and require hostname verification in API and worker pools.
- [ ] **H5 — Pin the VPS SSH host key.** Replace runtime `ssh-keyscan` trust with an expected protected fingerprint.
- [ ] **H6 — Configure a trusted-proxy policy.** Trust only the actual Cloudflare/VPS proxy chain and derive client IPs from Fastify.
- [ ] **H7 — Add `@fastify/rate-limit`.** Establish global limits and tighter limits for feedback, health/database, search, leaderboard, insights, and sync endpoints.
- [ ] **H8 — Add feedback abuse controls.** Limit text fields, strip inbound forwarding headers, and introduce a bot challenge after repeated submissions.
- [ ] **H9 — Isolate pull-request execution from secrets.** Use ephemeral self-hosted runners or GitHub-hosted runners for PR code.
- [ ] **H10 — Split UI report deployment into a trusted follow-up workflow.** The PR workflow should produce a sanitized artifact only.
- [ ] **H11 — Pin all GitHub Actions to full commit SHAs.**
- [ ] **H12 — Add a strict frontend CSP.** Begin in report-only mode, remove violations, then enforce it.

## Medium

- [ ] **M1 — Introduce sync revisions and optimistic concurrency.** Reject stale whole-document updates with `409 Conflict`.
- [ ] **M2 — Split match-journal data into individual server records.** Avoid replacing a 900 KB document for a small edit.
- [ ] **M3 — Replace two-second persistence polling with event-driven, debounced synchronization.**
- [ ] **M4 — Validate Supabase JWTs locally using cached JWKS.**
- [ ] **M5 — Materialize player-insight read models in the worker.**
- [ ] **M6 — Consolidate extended-statistics scans into one normalized player-match query.**
- [ ] **M7 — Add cache single-flight or advisory locking.**
- [ ] **M8 — Use explicit data-version rows instead of request-time `MAX(updated_at)` scans.**
- [ ] **M9 — Add route-level code splitting for audit, design-system, and detail pages.**
- [ ] **M10 — Extract a shared Zod transport-contract package.**
- [ ] **M11 — Remove the database singleton from the shared DB package.**
- [ ] **M12 — Compile API and worker into immutable production artifacts.**
- [ ] **M13 — Add CodeQL, dependency auditing, and secret scanning to CI.**
- [ ] **M14 — Align Node, PostgreSQL, TypeScript, and Zod support matrices across local, CI, and production environments.**

## Low

- [ ] **L1 — Break large route modules into schema, repository, service, cache, and presenter layers.**
- [ ] **L2 — Split `player-shared.ts` into contracts, persistence, API, navigation, and utility modules.**
- [ ] **L3 — Add a repository-wide `pnpm check` command covering frontend and backend.**
- [ ] **L4 — Add lint rules for unsafe `any`, floating promises, unvalidated JSON, and unrestricted outbound fetches.**
- [ ] **L5 — Remove committed `.DS_Store` and classify generated screenshots and generated source data explicitly.**
- [ ] **L6 — Move historical audits and design-review output under `docs/audits/` and `docs/design/`.**
- [ ] **L7 — Add architecture-decision records for authentication, synchronization, scraper trust, cache invalidation, and read-model ownership.**

---

## Recommended Execution Order

The first remediation release should contain only the highest-risk trust-boundary fixes:

1. Replace the shared parent-domain auth-token storage.
2. Restrict scraper destinations and redirect behavior.
3. Partition synchronized browser data by user.
4. Enable verified PostgreSQL TLS.
5. Pin the VPS SSH host identity.
6. Add API and feedback rate limiting.
7. Isolate self-hosted PR execution from secret-bearing workflows.

After those controls are deployed, the next release should address synchronization conflicts, player-insight read models, cache stampedes, and frontend code splitting.

---

## Suggested Issue Breakdown

For implementation tracking, create one issue for each Critical item and group the High items as follows:

1. **Authentication and session boundary hardening** — C1, C2.
2. **Scraper outbound-network security** — C3, C4, C5, C6.
3. **Per-user browser storage isolation** — H1, H2, H3.
4. **Infrastructure trust and TLS** — H4, H5.
5. **API abuse protection** — H6, H7, H8.
6. **CI runner and deployment supply-chain hardening** — H9, H10, H11.
7. **Browser security policy** — H12.
