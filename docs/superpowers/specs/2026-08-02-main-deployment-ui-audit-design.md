# Main Deployment UI Audit Design

## Goal

Run a non-blocking Playwright walkthrough after a successful `main` frontend deployment, capturing representative screenshots for anonymous and authenticated users without changing the focused PR screenshot workflow.

## Trigger and isolation

- The audit runs only for `push` events on `main` after `build-deploy` succeeds.
- It is a separate GitHub Actions job with `continue-on-error: true`, so deployment status is never blocked by audit failures.
- The existing `playwright.ui-review.config.ts` and PR-specific `testMatch` convention remain unchanged.
- A separate `playwright.main-audit.config.ts` selects only the main-deployment audit scenario.

## Screen coverage

The audit captures each representative screen type once rather than crawling every production entity:

- Root tabs: Home, Players, Leagues, Tournaments, H2H.
- Static pages: About, Data Coverage, Design System, Ratings.
- Entity screens discovered from rendered production lists: Player, Player Insights, Player Matches, Player Tournaments, Player Journal, Tournament, League, Team and Fixture.
- Authenticated state: signed-in drawer plus the same screens where user-specific favourites, journal data or synchronised state can affect rendering.

When production data does not expose a representative entity, the audit records that screen as skipped and continues. Navigation errors, application error pages, HTTP 5xx responses, failed requests and browser errors are written to diagnostics.

## Authentication

Use a dedicated synthetic Supabase user with email/password credentials stored as GitHub Actions secrets:

- `UI_AUDIT_EMAIL`
- `UI_AUDIT_PASSWORD`

The test signs in directly against Supabase Auth using the public project URL and publishable key already used by the frontend. It never uses a service-role key and never automates Google OAuth.

The returned Supabase session is written into the same chunked cookie storage contract used by `crossDomainAuthStorage`. Authentication is then verified by opening the application drawer and asserting the signed-in account and Sign out action are visible.

If either credential secret is absent, only the authenticated portion is skipped; the anonymous audit still runs and publishes its report.

## Security

- Credentials are read only from GitHub Actions secrets.
- Passwords, access tokens, refresh tokens and authentication headers are never written to screenshots, manifest entries, console output or diagnostics.
- Browser state is created in memory during the test and removed when the browser context closes.
- `test-results/` and `ui-review-report/` remain ignored by Git.
- The report exposes only the synthetic account email where the application itself renders it.

## Reporting

Reuse the existing screenshot report structure:

- viewport screenshots;
- per-screen diagnostics JSON;
- `manifest.json`;
- a browsable `index.html` grouped by anonymous and authenticated audit passes.

The workflow uploads a `main-ui-audit-<sha>` artifact, deploys the report under a stable Netlify alias and writes the report link into the GitHub Actions job summary. It does not comment on pull requests.

## Failure behaviour

- The Playwright command returns failure for broken navigation, authentication failure when credentials are configured, application error text, uncaught page errors or server errors.
- The workflow job remains non-blocking through job-level `continue-on-error: true`.
- Report upload and publication use `if: always()` so evidence remains available after failures.
