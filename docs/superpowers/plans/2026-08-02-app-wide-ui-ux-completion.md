# TT Players App-Wide UI/UX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining mobile design-system migration, polish the Player profile and root shell, remove stale compatibility exceptions, and lock the result with focused automated UI review.

**Architecture:** Keep `packages/design-system` as the sole owner of shell, section, hero, metric, list, state and touch-target geometry. Migrate the remaining `PlayerPage` and skeleton markup onto existing canonical components, tighten the static design-system guard, and verify the materially changed root and player journeys with one focused Playwright scenario.

**Tech Stack:** React 18, TypeScript 5.7, Vite 6, Vitest 3, Playwright 1.54, CSS custom properties, `@tt-players/design-system`, GitHub Actions.

## Global Constraints

- Preserve the five-tab information architecture and all current navigation behaviour.
- Preserve the premium native-mobile sports direction and green/orange brand character.
- Preserve existing product functionality and data semantics.
- Keep minimum interactive targets at `44x44px`.
- Support light mode, dark mode, reduced motion and widths down to `320px`.
- Do not add a styling framework or runtime UI dependency.
- Do not add page-specific geometry to conceal a missing shared variant.
- Follow `AGENTS.md`: one focused `*.pw.ts` scenario and only that scenario in `playwright.ui-review.config.ts`.

---

### Task 1: Lock the remaining migration debt with RED contracts

**Files:**
- Create: `apps/mobile/src/app-wide-design-system-completion.test.ts`

**Interfaces:**
- Consumes: source files under `apps/mobile/src` and `scripts/check-design-system-usage.mjs`.
- Produces: source contracts that fail until the root shell, Player profile, skeletons and guard exceptions are migrated.

- [ ] **Step 1: Write the failing source-contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('app-wide design-system completion', () => {
  it('uses canonical shell primitives at the tab root', () => {
    const source = read('./App.tsx');
    expect(source).toContain('AppShellPage');
    expect(source).toContain('AppPageContent');
    expect(source).not.toContain('<div id="page" className="app-shell-page">');
    expect(source).not.toContain('<main className="page-content app-shell-content');
  });

  it('uses canonical player profile compositions', () => {
    const source = read('./PlayerPage.tsx');
    expect(source).toContain('<EntityHero');
    expect(source).toContain('<MetricGrid');
    expect(source).toContain('<PageSection');
    expect(source).toContain('<DesignList');
    expect(source).not.toMatch(/<section\b[^>]*tt-player-(?:hero|section)/);
    expect(source).not.toContain('tt-player-section-state');
    expect(source).not.toMatch(/<List\b/);
  });

  it('uses PageSection for shared section skeletons', () => {
    const source = read('./components/Skeleton.tsx');
    expect(source).toContain('<PageSection');
    expect(source).not.toContain('tt-player-section');
  });

  it('has no legacy section-wrapper allowlist', () => {
    const source = read('../../../scripts/check-design-system-usage.mjs');
    expect(source).toContain('const legacySectionAllowlist = new Set([]);');
    expect(source).toContain('const inlineGeometryAllowlist = new Set([]);');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts`

Expected: FAIL because `App.tsx`, `PlayerPage.tsx`, `Skeleton.tsx` and the guard still contain legacy structures.

- [ ] **Step 3: Commit the RED contract**

```bash
git add apps/mobile/src/app-wide-design-system-completion.test.ts
git commit -m "test: define app-wide design-system completion"
```

---

### Task 2: Migrate the tab root to canonical shell primitives

**Files:**
- Modify: `apps/mobile/src/App.tsx`

**Interfaces:**
- Consumes: `AppShellPage` and `AppPageContent` from `./ui/appkit`.
- Produces: one canonical root shell with unchanged overlay and tab behaviour.

- [ ] **Step 1: Import canonical shell primitives**

```ts
import { AppPageContent, AppShellPage } from './ui/appkit';
```

- [ ] **Step 2: Replace raw shell markup**

```tsx
<AppShellPage>
  {!isLeagueSelectorOpen ? (
    <>
      <RootHeader ... />
      <TabFooterBar reselectBehavior="root" />
      <AppPageContent className="tt-root-content">
        {/* existing tab content unchanged */}
      </AppPageContent>
    </>
  ) : null}
  {/* existing selector and feedback overlays unchanged */}
</AppShellPage>
```

- [ ] **Step 3: Run the focused contract**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts`

Expected: root-shell assertion PASS; Player and guard assertions still FAIL.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/App.tsx
git commit -m "refactor: use canonical root shell"
```

---

### Task 3: Migrate shared skeleton sections

**Files:**
- Modify: `apps/mobile/src/components/Skeleton.tsx`

**Interfaces:**
- Consumes: `PageSection` from `../ui/appkit`.
- Produces: `SectionSkeleton` with the same public props and canonical section geometry.

- [ ] **Step 1: Import `PageSection`**

```ts
import { PageSection } from '../ui/appkit';
```

- [ ] **Step 2: Replace the legacy wrapper**

```tsx
export function SectionSkeleton({ titleWidth = 'tt-skeleton-text', noteWidth = 'tt-skeleton-text app-skeleton-short', rows = 3 }: Props) {
  return (
    <PageSection
      surface="flat"
      density="compact"
      title={<SkeletonBlock className={titleWidth} />}
      meta={<SkeletonBlock className={noteWidth} />}
      className="tt-section-skeleton"
    >
      <SkeletonList rows={rows} />
    </PageSection>
  );
}
```

- [ ] **Step 3: Run the focused contract**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts`

Expected: skeleton assertion PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/Skeleton.tsx
git commit -m "refactor: use canonical section skeleton"
```

---

### Task 4: Rebuild the Player hero with shared identity and metric components

**Files:**
- Modify: `apps/mobile/src/PlayerPage.tsx`

**Interfaces:**
- Consumes: `EntityHero`, `MetricGrid`, `DesignAvatar`, `Inline`, `Stack`, `Pill`, `AppButton`, `AppButtonLink`, `FavouriteButton`, `FormResultPills`.
- Produces: a canonical player identity hero preserving favourite, insights, identity removal and recent-form behaviour.

- [ ] **Step 1: Replace legacy imports**

Import `DesignAvatar`, `DesignList`, `EmptyState`, `EntityHero`, `ErrorState`, `Inline`, `MetricGrid`, `PageSection`, `Pill`, and `Stack`. Remove the legacy `List` import.

- [ ] **Step 2: Replace `PlayerProfileSkeleton` hero and sections**

Use `EntityHero` with skeleton title/subtitle/leading/actions and `MetricGrid` skeleton values. Use `SectionSkeleton` for the remaining sections.

- [ ] **Step 3: Replace the populated hero**

```tsx
<EntityHero
  eyebrow="Player profile"
  leading={<DesignAvatar size="hero" text={getInitials(stats.player_name)} />}
  title={stats.player_name}
  subtitle={`${stats.total} matches · ${stats.wins} wins · ${winRate}% win rate`}
  actionPlacement="below"
  actions={(
    <Inline gap="xs" align="center" wrap>
      <FavouriteButton ... />
      <AppButtonLink size="sm" tone="outline-highlight" onClick={openSection(...)}>Insights</AppButtonLink>
      {isCurrentUser ? <AppButton size="sm" tone="outline" onClick={clearMyPlayer}>This isn’t me</AppButton> : null}
    </Inline>
  )}
  highlights={(
    <Stack gap="sm">
      <MetricGrid
        density="compact"
        columns={4}
        ariaLabel="Player summary"
        metrics={[
          { label: 'Win rate', value: `${winRate}%` },
          { label: 'Wins', value: stats.wins },
          { label: 'Losses', value: stats.losses },
          { label: 'Streak', value: stats.streak || '—' },
        ]}
      />
      <FormResultPills ... />
    </Stack>
  )}
/>
```

- [ ] **Step 4: Run focused and existing player tests**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts player-match-list.test.tsx`

Expected: no regression in player match behaviour; Player contract still fails only for legacy lower sections.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/PlayerPage.tsx
git commit -m "refactor: align player hero with design system"
```

---

### Task 5: Migrate Player current-season content and states

**Files:**
- Modify: `apps/mobile/src/PlayerPage.tsx`

**Interfaces:**
- Consumes: `PageSection`, `SegmentedToggle`, `DesignList`, `ListItem`, `IconCircle`, `EmptyState`, `ErrorState`, `SkeletonList`.
- Produces: current-season clubs/tournaments section with explicit compact density and shared state treatments.

- [ ] **Step 1: Define a typed affiliation shape from query data**

Remove the `any` callback annotation and let TypeScript infer the item type from `affiliations`.

- [ ] **Step 2: Replace the section wrapper**

Use `PageSection surface="flat" density="compact" title="Current season"`, put `SegmentedToggle` in `action`, and use `meta` for team/event counts.

- [ ] **Step 3: Replace legacy lists and paragraph states**

Use `DesignList density="compact" divider="hairline"`; use `EmptyState` for no clubs/events and `ErrorState` with the relevant query `refetch` function for failures.

- [ ] **Step 4: Preserve tournament navigation and full-list action**

Keep the existing event row content and `View all tournaments` action, changing only its visual composition and sentence casing.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts`

Expected: no legacy `List` remains in `PlayerPage.tsx`; lower Form/Recent sections still fail the legacy wrapper assertion.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/PlayerPage.tsx
git commit -m "refactor: standardise player season section"
```

---

### Task 6: Migrate Player form and recent-match sections

**Files:**
- Modify: `apps/mobile/src/PlayerPage.tsx`

**Interfaces:**
- Consumes: `PageSection`, `MetricGrid`, `ErrorState`, `PlayerMatchList`.
- Produces: canonical Form and Recent matches sections with shared headings, metadata and error treatment.

- [ ] **Step 1: Replace Form with `PageSection` and `MetricGrid`**

Use `title="Form"`, `description="Rolling performance"`, and three metrics: Rolling 10, Rolling 20 and Momentum. Loading uses skeleton metric values. Failure uses `ErrorState` with `insightsQuery.refetch`.

- [ ] **Step 2: Replace Recent Matches wrapper**

Use `PageSection title="Recent matches"` and `meta` containing the existing count label. Keep `PlayerMatchList` behaviour unchanged.

- [ ] **Step 3: Run the focused contract and player tests**

Run: `pnpm --filter @tt-players/mobile test -- app-wide-design-system-completion.test.ts player-match-list.test.tsx`

Expected: all Player source-contract assertions PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/PlayerPage.tsx
git commit -m "refactor: finish player profile section migration"
```

---

### Task 7: Tighten design-system enforcement and update inventory

**Files:**
- Modify: `scripts/check-design-system-usage.mjs`
- Modify: `docs/design-system/component-inventory.md`

**Interfaces:**
- Produces: no legacy section-wrapper exceptions and accurate final migration status.

- [ ] **Step 1: Empty obsolete allowlists**

```js
const legacySectionAllowlist = new Set([]);
const inlineGeometryAllowlist = new Set([]);
```

Retain compatibility CSS names only while those files still contain documented domain presentation.

- [ ] **Step 2: Update the migration matrix**

Mark root shell, Players, Player profile, Player insights and Event detail as migrated. Record only genuine specialist exceptions such as fixture scorecards and dynamic H2H evidence bars.

- [ ] **Step 3: Run guard and mobile tests**

Run:

```bash
pnpm check:design-system
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-design-system-usage.mjs docs/design-system/component-inventory.md
git commit -m "chore: close design-system migration exceptions"
```

---

### Task 8: Add the focused Playwright UI review

**Files:**
- Create: `apps/mobile/tests/ui-review/zz-app-wide-ui-ux-completion.pw.ts`
- Modify: `playwright.ui-review.config.ts`

**Interfaces:**
- Produces: focused visual and functional review for the changed root and Player journeys.

- [ ] **Step 1: Build the scenario from existing UI-review helpers**

The scenario must:

- open Home and assert canonical root content has no horizontal overflow;
- open Players and verify search/following state remains functional;
- discover a stable player through the API or rendered search results;
- open the Player profile and assert the hero, Ability Rating, Current season, Form and Recent matches sections;
- verify the hero and section content remain within the viewport at `390px` and `320px`;
- toggle dark mode and capture the Player profile;
- capture only Home, Player profile standard, Player profile narrow and Player profile dark screenshots.

- [ ] **Step 2: Select only the new scenario**

```ts
testMatch: 'zz-app-wide-ui-ux-completion.pw.ts',
```

- [ ] **Step 3: Run Playwright review**

Run: `pnpm exec playwright test --config=playwright.ui-review.config.ts`

Expected: functional assertions PASS and screenshot manifest/report produced.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/tests/ui-review/zz-app-wide-ui-ux-completion.pw.ts playwright.ui-review.config.ts
git commit -m "test: review app-wide UI UX completion"
```

---

### Task 9: Final verification and PR readiness

**Files:**
- Review all changed files.

- [ ] **Step 1: Run the complete required checks**

```bash
pnpm check:design-system
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm exec playwright test --config=playwright.ui-review.config.ts
```

- [ ] **Step 2: Review generated screenshots**

Confirm no clipping, overlap, unexpected horizontal scroll, weak dark-mode separation, inconsistent section rhythm or obscured final rows at `320px`, `390px` and standard viewport sizes.

- [ ] **Step 3: Review the diff for scope**

Confirm no product behaviour, data semantics, API shape or navigation history changed.

- [ ] **Step 4: Open a draft PR**

Use a summary covering canonical shell migration, Player profile migration, guard tightening, accessibility/state improvements and verification status. Keep the PR draft until CI and the focused UI review pass.
