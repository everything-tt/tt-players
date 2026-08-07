# Event Detail Metadata and Conditional Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture and display complete TTE event information while hiding all player/match analysis until recorded results exist.

**Architecture:** Extend the TTE parser payload, keep source-specific descriptive fields in `tournament_sources.raw_payload`, expose them through the events API, and render metadata/result sections independently in the mobile page. Existing canonical competition columns remain the source of dates, venue/address, deadline and entry links.

**Tech Stack:** TypeScript, Cheerio, Kysely/PostgreSQL JSONB, Fastify/Zod, React, Vitest, shared mobile appkit.

## Global Constraints

- New metadata fields are nullable and backward compatible.
- Do not infer player, match or stage information from an empty results array.
- Reuse shared appkit/design-system components.
- No database migration is required; descriptive source fields live in `raw_payload`.

---

### Task 1: Parser contract

**Files:**
- Modify: `apps/worker/src/tte-events-client.ts`
- Test: `apps/worker/src/__tests__/tte-calendar-client.test.ts`

- [ ] Add failing expectations for description, organiser name/link and venue link from JSON-LD and DOM fixtures.
- [ ] Extend `TteCalendarEvent` and parser fallbacks.
- [ ] Run the worker parser test and worker build.

### Task 2: API metadata contract

**Files:**
- Modify: `apps/api/src/routes/events.ts`
- Test: `apps/api/src/__tests__/events.test.ts`

- [ ] Seed canonical venue address and rich calendar `raw_payload` fields in the API test.
- [ ] Add failing detail-response expectations.
- [ ] Extend the Zod schema, selection and mapping with nullable metadata fields.
- [ ] Run events API tests and API build.

### Task 3: Conditional page model

**Files:**
- Modify: `apps/mobile/src/tournament-analysis.ts`
- Test: `apps/mobile/src/tournament-analysis.test.ts`

- [ ] Add failing tests for result-section visibility and upcoming/completed availability copy.
- [ ] Implement the pure page-state helper.
- [ ] Run the mobile unit test.

### Task 4: Event detail UI

**Files:**
- Modify: `apps/mobile/src/player-shared.ts`
- Modify: `apps/mobile/src/EventDetailPage.tsx`

- [ ] Extend the shared event response type.
- [ ] Add always-visible event information and description sections.
- [ ] Render recorded metrics and every player/match section only when `hasRecordedResults` is true.
- [ ] Render one neutral results-availability message otherwise.
- [ ] Run the design-system check, mobile tests and production build.

### Task 5: PR verification and backfill

- [ ] Open the pull request and inspect its diff.
- [ ] Wait for required GitHub Actions checks and inspect failures if any.
- [ ] Trigger the production TTE calendar sync only after the scraper/API change is deployed; before deployment, document that the action would execute the previous VPS release.
