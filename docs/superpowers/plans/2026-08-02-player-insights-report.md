# Player Insights Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved balanced player-insights report with summary, enhanced rating/form, ranked rival groups, and career story.

**Architecture:** Add a separate canonical-player rival endpoint backed by a pure ranking helper, then consume it through TanStack Query. Build the mobile page from focused components and pure view-model helpers while retaining the existing rating-history chart and design-system shell.

**Tech Stack:** TypeScript, Fastify, Kysely/PostgreSQL, Zod, React 18, TanStack Query, Vitest, Playwright, CSS design tokens.

## Global Constraints

- Singles records only; do not present doubles analysis.
- Keep the existing rating-history chart behaviour and range controls.
- Show at most four rivals per category.
- Use existing semantic CSS variables and AppKit primitives where appropriate.
- Every material mobile UI change must have one focused Playwright review scenario.

---

### Task 1: Define rival ranking behaviour

**Files:**
- Create: `apps/api/src/player-rivals-ranking.ts`
- Create: `apps/api/src/__tests__/player-rivals-ranking.test.ts`

**Interfaces:**
- Produces: `rankPlayerRivals(encounters, limit)` returning `{ toughest, easiest, improving }`.

- [ ] Write tests proving minimum encounter thresholds, deterministic ordering, top-four limits, and first-half versus second-half improvement.
- [ ] Run the focused API test and confirm it fails because the ranking module does not exist.
- [ ] Implement the smallest pure ranking module that satisfies the tests.
- [ ] Run the focused test and API typecheck.
- [ ] Commit the ranking behaviour.

### Task 2: Add the rival endpoint

**Files:**
- Create: `apps/api/src/routes/player-rivals.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `rankPlayerRivals` from Task 1.
- Produces: `GET /api/players/:id/rivals` with canonical ranked rival arrays.

- [ ] Add a route-level test or schema assertion for the response contract.
- [ ] Confirm the test fails before route registration.
- [ ] Query canonical singles encounters, exclude walkovers/deleted rows, rank the result, and register the plugin under `/api/players`.
- [ ] Run API tests and build.
- [ ] Commit the endpoint.

### Task 3: Define the mobile report view model

**Files:**
- Create: `apps/mobile/src/player-insights-model.ts`
- Create: `apps/mobile/src/player-insights-model.test.ts`
- Modify: `apps/mobile/src/player-shared.ts`
- Modify: `apps/mobile/src/queries.ts`

**Interfaces:**
- Produces: typed rival response/query plus helpers for takeaway copy, month labels, milestones, and rival tabs.

- [ ] Write failing tests for summary copy, month formatting, milestone fallback, and rival tab selection.
- [ ] Implement the pure helpers and API types/query hook.
- [ ] Run the focused mobile tests and mobile TypeScript build.
- [ ] Commit the client data model.

### Task 4: Enhance rating history with form context

**Files:**
- Modify: `apps/mobile/src/components/PlayerRatingHistoryChart.tsx`
- Modify: `apps/mobile/src/ratings-ui.css`

**Interfaces:**
- `PlayerRatingHistoryChart` accepts optional `recentResults` and derives current, peak, and range change from loaded points.

- [ ] Add a focused component-contract test for the new prop and summary labels.
- [ ] Confirm it fails against the existing component.
- [ ] Add result pills and compact rating summary metrics without changing chart range selection or point interaction.
- [ ] Run mobile tests/build.
- [ ] Commit the rating/form enhancement.

### Task 5: Build the report page

**Files:**
- Create: `apps/mobile/src/player-insights.css`
- Create: `apps/mobile/src/components/PlayerInsightsSummary.tsx`
- Create: `apps/mobile/src/components/PlayerRivalIntelligence.tsx`
- Create: `apps/mobile/src/components/PlayerCareerStory.tsx`
- Modify: `apps/mobile/src/PlayerInsightsPage.tsx`

**Interfaces:**
- Consumes player stats, insights, ranked rivals, and the existing navigation API.

- [ ] Replace the hero/list presentation with summary, rating/form, segmented rival list, and career story.
- [ ] Keep rival loading/error/empty states local to the section.
- [ ] Make rival rows open the existing H2H route.
- [ ] Verify compact and narrow layouts have no horizontal overflow.
- [ ] Run mobile tests/build and design-system check.
- [ ] Commit the page redesign.

### Task 6: Add focused UI review coverage

**Files:**
- Create: `apps/mobile/tests/ui-review/player-insights-report.pw.ts`
- Modify: `apps/mobile/playwright.ui-review.config.ts`

**Interfaces:**
- Produces the PR-only Playwright screenshots and responsive assertions.

- [ ] Follow an existing UI-review scenario's manifest/report helpers.
- [ ] Navigate to a representative player insights page and wait on stable API/rendered-state signals.
- [ ] Assert summary metrics, rating history, rival tab switching, career rows, and no viewport overflow.
- [ ] Capture phone and narrow-phone screenshots.
- [ ] Point `testMatch` only to `player-insights-report.pw.ts`.
- [ ] Run Playwright collection and the focused scenario in CI.
- [ ] Commit UI review coverage.

### Task 7: Final verification and PR

- [ ] Run API tests/build, mobile tests/build, design-system check, and Playwright `--list`.
- [ ] Review the final diff for unsupported claims, misleading actions, and duplicated data.
- [ ] Open a PR with implementation summary, API contract, and verification evidence.
