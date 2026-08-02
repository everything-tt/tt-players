# H2H Common Opponents Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading ten-row common-opponent cap with a five-row H2H preview and a dedicated sortable page that can load every shared opponent, while making only the MatchRecordRow leading score badge match the compact player-list badge proportions.

**Architecture:** Keep the existing H2H analysis endpoint for verdict summary data and add a focused common-opponents endpoint for full exploration. The API aggregates all qualifying singles records, sorts deterministically in one pure helper, and returns cursor-paged results. Mobile uses a React Query infinite query, a dedicated route/page, and a fixed five-row preview that navigates to the page.

**Tech Stack:** Fastify, Kysely/PostgreSQL, Zod, React, React Router, TanStack React Query, Vitest, Testing Library, shared TT Players design system.

## Global Constraints

- The H2H preview shows exactly the top five rows ordered by combined match evidence.
- The preview has no `Show more` or `All N shown` footer.
- The dedicated page supports `Most evidence`, `Most recent`, `Largest edge`, and `Closest record`; default is `Most evidence`.
- `Most recent` means the latest qualifying match played by either compared player against the shared opponent.
- Exclude doubles, walkovers, deleted rubbers, deleted fixtures, and the compared players themselves.
- Preserve canonical-player alias handling.
- Only change the MatchRecordRow leading score badge; do not alter row spacing, copy layout, or trailing actions.
- Use branch `feature/h2h-common-opponents-page`; never commit implementation to `main`.

---

### Task 1: Common-opponent API contract, sorting, and cursor pagination

**Files:**
- Create: `apps/api/src/routes/h2h-common-opponents.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/__tests__/h2h-correctness.test.ts`

**Interfaces:**
- Produces: `h2hCommonOpponentRoutes(db: Kysely<Database>): FastifyPluginAsync`
- Produces endpoint: `GET /api/players/:playerId1/h2h/:playerId2/common-opponents?sort=evidence|recent|edge|closest&limit=20&cursor=...`
- Produces response fields: `players`, `total`, `data`, `next_cursor`.

- [ ] **Step 1: Add failing API tests**

Extend the existing 12-opponent fixture data so opponents have different evidence counts and dates. Add tests asserting:

```ts
const first = await request
  .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/common-opponents?sort=evidence&limit=5`)
  .expect(200);
expect(first.body.total).toBe(12);
expect(first.body.data).toHaveLength(5);
expect(first.body.next_cursor).toEqual(expect.any(String));

const second = await request
  .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/common-opponents?sort=evidence&limit=5&cursor=${encodeURIComponent(first.body.next_cursor)}`)
  .expect(200);
expect(new Set([...first.body.data, ...second.body.data].map((row) => row.opponent_id)).size)
  .toBe(first.body.data.length + second.body.data.length);
```

Also assert `recent`, `edge`, and `closest` ordering and that reversing player IDs swaps player records and edge signs.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm --filter @tt-players/api test -- h2h-correctness.test.ts
```

Expected: failure because the common-opponents route is not registered.

- [ ] **Step 3: Implement the route**

Implement a route module with:

```ts
export type CommonOpponentSort = 'evidence' | 'recent' | 'edge' | 'closest';

interface CommonOpponentItem {
  opponent_id: string;
  opponent_name: string;
  latest_played_at: string | null;
  combined_played: number;
  player1: { played: number; wins: number; losses: number; win_rate: number };
  player2: { played: number; wins: number; losses: number; win_rate: number };
  edge: number;
}
```

Use one SQL aggregation over all qualifying rubbers. Canonicalize the two requested players and each opponent. Calculate `latest_played_at` using `MAX(COALESCE(fixture.date_played::timestamp, rubber.played_at, fixture.created_at))`. Sort the complete result in a pure comparator:

```ts
const evidence = (a: CommonOpponentItem, b: CommonOpponentItem) =>
  b.combined_played - a.combined_played || a.opponent_name.localeCompare(b.opponent_name) || a.opponent_id.localeCompare(b.opponent_id);
```

For `recent`, sort null dates last; for `edge`, sort `Math.abs(edge)` descending; for `closest`, sort it ascending. Encode the final row’s full ordering key and opponent ID as URL-safe base64 JSON. Apply the cursor by comparing rows to that decoded key, then return `limit` rows and a cursor only when more rows remain.

- [ ] **Step 4: Register the route**

In `apps/api/src/app.ts`, import and register `h2hCommonOpponentRoutes` under the same `/api/players` prefix as the existing player H2H routes.

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm --filter @tt-players/api test -- h2h-correctness.test.ts
```

Expected: all H2H correctness tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/h2h-common-opponents.ts apps/api/src/app.ts apps/api/src/__tests__/h2h-correctness.test.ts
git commit -m "feat(api): add paged common opponents endpoint"
```

### Task 2: Mobile data types and infinite query

**Files:**
- Create: `apps/mobile/src/h2h-common-opponents-types.ts`
- Create: `apps/mobile/src/h2h-common-opponents-query.ts`
- Create: `apps/mobile/src/h2h-common-opponents-query.test.ts`

**Interfaces:**
- Produces: `CommonOpponentSort`.
- Produces: `CommonOpponentsResponse` matching the API response.
- Produces: `useH2HCommonOpponentsQuery(playerId1, playerId2, sort, enabled)`.

- [ ] **Step 1: Write the failing query-contract test**

Assert that the query key includes both player IDs and sort mode, that the request sends `limit=20`, and that `getNextPageParam` returns `next_cursor` or `undefined`.

- [ ] **Step 2: Run the focused mobile test and confirm failure**

```bash
pnpm --filter @tt-players/mobile test -- h2h-common-opponents-query.test.ts
```

- [ ] **Step 3: Implement types and hook**

Use TanStack `useInfiniteQuery` with:

```ts
queryKey: ['players', 'h2h', playerId1, playerId2, 'common-opponents', sort],
initialPageParam: null as string | null,
getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
```

Build query parameters with `sort`, `limit=20`, and optional cursor.

- [ ] **Step 4: Run the focused test**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/h2h-common-opponents-types.ts apps/mobile/src/h2h-common-opponents-query.ts apps/mobile/src/h2h-common-opponents-query.test.ts
git commit -m "feat(mobile): add common opponents infinite query"
```

### Task 3: Dedicated Common Opponents page and routing

**Files:**
- Create: `apps/mobile/src/CommonOpponentsPage.tsx`
- Create: `apps/mobile/src/CommonOpponentsPage.test.tsx`
- Modify: `apps/mobile/src/AppRouter.tsx`
- Modify: `apps/mobile/src/h2h-ui.css`

**Interfaces:**
- Route: `/tabs/:tabId/h2h/:playerAId/:playerBId/common-opponents`.
- Page reads `playerAId` and `playerBId` from route params.
- Selecting a row navigates to `players/player/:opponentId` through `navigateInTab`.

- [ ] **Step 1: Write failing page tests**

Cover default `Most evidence`, four sort options, flattened pages, load-more invocation, sort reset, initial error retry, incremental error retry, and row-to-profile navigation.

- [ ] **Step 2: Run page tests and confirm failure**

```bash
pnpm --filter @tt-players/mobile test -- CommonOpponentsPage.test.tsx
```

- [ ] **Step 3: Implement the page**

Use `TabShellPage`, `DetailHeader`, `AppPageContent`, `PageSection`, `DesignList/List`, `ListItem`, `DesignAvatar`, `Pill`, `EmptyState`, `ErrorState`, and `InfiniteListFooter`. Add a visible native `<select>` labelled `Sort by` with the four approved options. Render latest date in `en-GB` format. Do not render an end-of-list `All N shown` message.

- [ ] **Step 4: Add the route**

Import `CommonOpponentsPage` in `AppRouter.tsx` and add the tab-scoped route before `/tabs/:tabId/*`.

- [ ] **Step 5: Run page tests and mobile build**

```bash
pnpm --filter @tt-players/mobile test -- CommonOpponentsPage.test.tsx
pnpm --filter @tt-players/mobile build
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/CommonOpponentsPage.tsx apps/mobile/src/CommonOpponentsPage.test.tsx apps/mobile/src/AppRouter.tsx apps/mobile/src/h2h-ui.css
git commit -m "feat(mobile): add sortable common opponents page"
```

### Task 4: Five-row H2H preview and navigation

**Files:**
- Modify: `apps/mobile/src/components/RatingPredictionPanel.tsx`
- Modify: `apps/mobile/src/H2HTabContent.tsx`
- Modify: `apps/mobile/src/h2h-analysis-query.ts`
- Modify: `apps/mobile/src/match-record-consumers.test.ts`

**Interfaces:**
- `RatingPredictionPanel` accepts `onOpenCommonOpponents?: () => void`.
- `useH2HAnalysisQuery` requests `common_limit=5`.

- [ ] **Step 1: Add failing preview tests**

Assert that the analysis URL contains `common_limit=5`, the preview renders no more than five rows, no `All 10 shown` copy exists, and activating the section action navigates to the dedicated route.

- [ ] **Step 2: Run the tests and confirm failure**

```bash
pnpm --filter @tt-players/mobile test -- match-record-consumers.test.ts
```

- [ ] **Step 3: Implement the preview change**

Set `paginate={false}` on the common-opponent preview list and render `analysis.common_opponents.data.slice(0, 5)`. Make the shared-count pill or a `View all` action a real button with `aria-label="View all N common opponents"`. In `H2HTabContent`, navigate within the H2H tab to `h2h/${playerA.id}/${playerB.id}/common-opponents`.

- [ ] **Step 4: Run focused tests**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/RatingPredictionPanel.tsx apps/mobile/src/H2HTabContent.tsx apps/mobile/src/h2h-analysis-query.ts apps/mobile/src/match-record-consumers.test.ts
git commit -m "feat(mobile): link five-row common opponent preview"
```

### Task 5: Compact MatchRecordRow leading score badge only

**Files:**
- Modify: `packages/design-system/src/components/MatchRecordRow.css`
- Modify: `packages/design-system/src/components/MatchRecordRow.test.tsx`

**Interfaces:**
- No component API change.
- Preserve the current title, metadata, row density, and trailing action layout.

- [ ] **Step 1: Add a failing style-contract test**

Assert the score element retains the score and outcome classes and snapshot/class contract. Add a CSS source assertion, if that is the repository convention, for a compact fixed `44px` badge with `var(--radius-sm)`.

- [ ] **Step 2: Run the design-system test and confirm failure**

```bash
pnpm --filter @tt-players/design-system test -- MatchRecordRow.test.tsx
```

- [ ] **Step 3: Change only the leading badge CSS**

Update `.tt-match-record-score` to use the same compact geometry as the player-list leading badge treatment:

```css
.tt-match-record-score {
  box-sizing: border-box;
  flex: 0 0 44px;
  height: 44px;
  min-height: 44px;
  width: 44px;
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
```

Keep the existing win/loss/neutral colour semantics. Remove the larger `standard` and narrow-screen geometry overrides so every score (`3–0`, `W`, `L`) uses the same dimensions. Do not edit row or action selectors.

- [ ] **Step 4: Run the focused test and design-system check**

```bash
pnpm --filter @tt-players/design-system test -- MatchRecordRow.test.tsx
pnpm check:design-system
```

- [ ] **Step 5: Commit**

```bash
git add packages/design-system/src/components/MatchRecordRow.css packages/design-system/src/components/MatchRecordRow.test.tsx
git commit -m "fix(design-system): compact match score badge"
```

### Task 6: Full verification and PR

**Files:**
- Modify only files required to fix verification failures caused by this feature.

- [ ] **Step 1: Run backend verification**

```bash
pnpm run typecheck:backend
pnpm --filter @tt-players/api test -- h2h-correctness.test.ts
```

- [ ] **Step 2: Run mobile and design-system verification**

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm check:design-system
```

- [ ] **Step 3: Review the diff**

Confirm the preview is capped at five, the dedicated page can reach all rows, sorting is deterministic, no `All N shown` copy remains in this flow, and MatchRecordRow changes are limited to the leading badge.

- [ ] **Step 4: Push and open the PR**

Create a PR from `feature/h2h-common-opponents-page` to `main` with a summary of the API endpoint, full-page UI, preview behavior, score-badge cleanup, tests, and any verification unavailable in the connector environment.
