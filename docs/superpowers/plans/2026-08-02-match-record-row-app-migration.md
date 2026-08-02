# Match Record Row App Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared design-system `MatchRecordRow` and migrate every compact completed-result list where that presentation is appropriate.

**Architecture:** The design system owns the score tile, row layout, direct actions, accessibility, and responsive behaviour. Application helpers convert player, team, H2H, and tournament data into a small score model; page components retain routing, filtering, pagination, and business rules. Detailed fixture rubber scorecards and non-result rows remain unchanged.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, Fastify, Kysely, shared `@tt-players/design-system` package.

## Global Constraints

- Use `MatchRecordRow` only for compact completed-result rows.
- Keep fixture-detail rubber scorecards and aggregate fixture hero scores unchanged.
- Keep upcoming and postponed fixtures on schedule/status rows.
- Score tile values are `3–1`, `W`, `L`, `D`, or `—`.
- Consumers order scores for the page context; the design-system component never parses domain data.
- Preserve the PR #88 row interaction model and direct action buttons.
- Secondary action clicks must not trigger the primary row action.
- Tournament score fields are nullable and backward compatible.

---

### Task 1: Add score-model tests and `MatchRecordRow` component contract

**Files:**
- Create: `packages/design-system/src/components/MatchRecordRow.tsx`
- Modify: `packages/design-system/src/index.ts`
- Modify: `apps/mobile/src/player-match-list.test.tsx`
- Create: `apps/mobile/src/match-record-row.test.tsx`

**Interfaces:**
- Produces: `MatchRecordScore`, `MatchRecordAction`, `MatchRecordRowProps`, and `MatchRecordRow`.
- `MatchRecordScore = { value: string; outcome: 'win' | 'loss' | 'neutral'; ariaLabel: string }`.
- `MatchRecordAction = { iconClassName: string; label: string; onClick: () => void; tone?: 'accent' | 'neutral' }`.

- [ ] **Step 1: Write failing render contracts**

Add tests that render `MatchRecordRow` and assert:

```tsx
<MatchRecordRow
  score={{ value: '3–1', outcome: 'win', ariaLabel: 'Won 3 games to 1' }}
  title="Lucy Elliott"
  metadata={['County Championships Junior', '11 Apr 2026']}
  actions={[{ iconClassName: 'fa fa-calendar', label: 'View fixture', onClick: () => undefined }]}
/>
```

Expected markup includes `tt-match-record-row`, `tt-match-record-score--win`, visible `3–1`, the accessible score label, metadata, and the direct action label. Add separate cases for `W`, `L`, `D`, `—`, and zero/two actions.

- [ ] **Step 2: Push tests and verify RED in Mobile CI**

Expected: TypeScript/test failure because `MatchRecordRow` is not exported.

- [ ] **Step 3: Implement the minimal component**

Use `ListItem` and `AppButton`. Render a stable leading score tile, title/metadata content, and up to two direct buttons. Wrap action callbacks so they remain separate from the row button.

- [ ] **Step 4: Export the component and run Mobile CI**

Expected: component contract tests pass.

### Task 2: Add shared application score adapters

**Files:**
- Create: `apps/mobile/src/match-record.ts`
- Create: `apps/mobile/src/match-record.test.ts`
- Modify: `apps/mobile/src/player-match-list.ts`

**Interfaces:**
- Produces:
  - `playerMatchScore(result: string, isWin: boolean): MatchRecordScore`
  - `perspectiveScore(first: number | null, second: number | null, outcome: 'W' | 'L' | 'D' | null): MatchRecordScore | null`
  - `tournamentScore(input): MatchRecordScore`

- [ ] **Step 1: Write failing parser tests**

Assert:

```ts
expect(playerMatchScore('Won 3-1', true).value).toBe('3–1');
expect(playerMatchScore('Won', true).value).toBe('W');
expect(playerMatchScore('Lost', false).value).toBe('L');
expect(playerMatchScore('Unknown', false).value).toBe('—');
expect(perspectiveScore(8, 2, 'W')?.value).toBe('8–2');
expect(perspectiveScore(null, null, null)).toBeNull();
```

- [ ] **Step 2: Verify RED**

Expected: missing module/functions.

- [ ] **Step 3: Implement minimal parsing and score orientation**

Normalize hyphen, en dash, and colon separators to an en dash. Use explicit outcome for W/L/D fallback and neutral unknown state.

- [ ] **Step 4: Verify helper tests pass**

### Task 3: Migrate player Recent Matches and full history

**Files:**
- Modify: `apps/mobile/src/components/PlayerMatchList.tsx`
- Modify: `apps/mobile/src/components/PlayerMatchList.css`
- Modify: `apps/mobile/src/player-match-list.test.tsx`

**Interfaces:**
- Consumes: `MatchRecordRow`, `playerMatchScore`.

- [ ] **Step 1: Update tests to require a leading score tile and no result pill**

Assert detailed `3–1`, scoreless `W/L`, direct journal/source actions, row-as-opponent behaviour, and no `tt-pill--success`/`tt-pill--danger` result badge.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Replace the custom `ListItem` structure with `MatchRecordRow`**

Pass competition and full date as metadata. Keep opponent navigation, Quick Journal, fixture/event actions, infinite loading, and missing-opponent behaviour.

- [ ] **Step 4: Remove obsolete player-row layout CSS and verify tests**

### Task 4: Migrate Home and Leagues dashboard results

**Files:**
- Modify: `apps/mobile/src/HomeTabContent.tsx`
- Modify: `apps/mobile/src/LeaguesTabContent.tsx`
- Create: `apps/mobile/src/match-record-consumers.test.ts`
- Modify: `apps/mobile/src/app-shell.css`

**Interfaces:**
- Consumes: `MatchRecordRow`, `perspectiveScore`.

- [ ] **Step 1: Write source-contract tests**

Read both page files and assert they import/use `MatchRecordRow`, no longer render `tt-score-badge`, preserve fixture navigation, and present home score first.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Migrate both result lists**

Use team names as title, league/division/date metadata, neutral score tone, and row click to fixture.

- [ ] **Step 4: Remove `tt-score-badge` CSS only when no remaining consumer exists**

### Task 5: Migrate completed Team page rows only

**Files:**
- Modify: `apps/mobile/src/TeamPage.tsx`
- Modify: `apps/mobile/src/match-record-consumers.test.ts`

**Interfaces:**
- Consumes: `MatchRecordRow`, `perspectiveScore`.

- [ ] **Step 1: Add failing source/behaviour contracts**

Assert completed rows use `MatchRecordRow`, viewed-team score is first, win/loss/draw tone is correct, and schedule/status `ListItem` remains for non-completed fixtures.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Split completed and non-completed rendering**

Completed rows use the shared component. Upcoming/postponed rows keep calendar/status presentation and existing filters/navigation.

- [ ] **Step 4: Verify Team page contracts and build**

### Task 6: Migrate H2H Meeting history

**Files:**
- Modify: `apps/mobile/src/H2HTabContent.tsx`
- Modify: `apps/mobile/src/match-record-consumers.test.ts`

**Interfaces:**
- Consumes: `MatchRecordRow`, `playerMatchScore`.

- [ ] **Step 1: Add failing contract**

Assert Meeting history uses `MatchRecordRow`, no longer uses `OutcomeBadge` for encounters, orders score from Player A's perspective, and keeps fixture navigation.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Migrate encounter rows**

Use the opposing player as title and date/league metadata. Preserve all other H2H narrative sections.

- [ ] **Step 4: Verify H2H tests/build**

### Task 7: Extend tournament result score data

**Files:**
- Modify: `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/__tests__/events.test.ts`
- Modify: `apps/mobile/src/player-shared.ts`

**Interfaces:**
- Extends `EventResultRow` with `home_games_won: number | null` and `away_games_won: number | null`.

- [ ] **Step 1: Write failing API contract test**

Assert event detail result payload contains both nullable game-score fields.

- [ ] **Step 2: Verify RED in backend tests**

- [ ] **Step 3: Select and map game scores in `events.ts`**

Add fields to the database selection, response schema/type if present, mapper, and mobile contract.

- [ ] **Step 4: Verify API tests pass**

### Task 8: Migrate tournament Results rows

**Files:**
- Modify: `apps/mobile/src/EventDetailPage.tsx`
- Modify: `apps/mobile/src/match-record-consumers.test.ts`

**Interfaces:**
- Consumes: `MatchRecordRow`, `tournamentScore`.

- [ ] **Step 1: Add failing contract**

Assert Results uses `MatchRecordRow`, uses game scores when present, falls back to W/L, follows selected-player orientation, and preserves the existing player-filter row action.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Replace result `ListItem` rows**

Keep round grouping, filters, time metadata, and player selection logic unchanged.

- [ ] **Step 4: Verify tournament tests/build**

### Task 9: Document and demonstrate the shared component

**Files:**
- Modify: `apps/mobile/src/DesignSystemPage.tsx`
- Modify: `docs/design-system/component-inventory.md`
- Modify: `packages/design-system/README.md`

- [ ] **Step 1: Add source contracts requiring component documentation/example**

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Add examples for detailed, outcome-only, draw, unknown, and two-action rows**

- [ ] **Step 4: Verify design-system usage check and build**

### Task 10: Expand focused Playwright review and finish PR

**Files:**
- Modify: `apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts`
- Modify: `playwright.ui-review.config.ts`
- Modify: PR #88 title/body

- [ ] **Step 1: Update UI review assertions and screenshots**

Capture representative player, dashboard/team, H2H, and tournament rows. Assert score tiles exist, result pills/badges are absent in migrated rows, direct actions work, and metadata remains readable at 390px.

- [ ] **Step 2: Run full verification**

Required checks:

```bash
pnpm check:design-system
pnpm mobile:build
pnpm --filter @tt-players/mobile test -- --passWithNoTests
pnpm --filter @tt-players/api test
```

Use GitHub Actions as the runner when local execution is unavailable.

- [ ] **Step 3: Inspect published screenshots**

Check score-tile balance, long-name truncation, scoreless W/L fallback, action touch targets, and consistency across pages.

- [ ] **Step 4: Update PR summary**

Describe the shared component, full app review, migrated pages, intentionally excluded scorecards, API extension, and verification evidence.
