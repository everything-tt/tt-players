# Player Match List and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the player profile’s fixed last-ten list with a compact, shared, infinitely paged match list; add opponent and Quick Journal actions; and make player identity/following behaviour unambiguous.

**Architecture:** Introduce a reusable `usePagedPlayerMatches` hook for server paging and a reusable `PlayerMatchList` presentation component consumed by both profile and full-history pages. Add a design-system `ActionMenu` built on the existing accessible `BottomSheet`, keep journal query parsing in pure helpers, and leave the existing player hero and other profile sections structurally unchanged.

**Tech Stack:** React 18, TypeScript 5.7 strict mode, TanStack Query 5, React Router 7, Vitest 3, Playwright 1.54, shared TT Players design system.

## Global Constraints

- Preserve the existing player hero, rating panel, clubs/tournaments section, form section, profile header, and general page ordering.
- Load the newest 20 matches first and every later page in batches of 20.
- Use `InfiniteListFooter` for automatic loading plus its accessible manual fallback.
- Main row navigation remains league fixture or tournament event navigation.
- `Quick Journal` is available only on the player identified as the current user.
- Journal prefill uses validated `date`, `opponent`, and `outcome` query parameters and never auto-saves.
- Do not attempt name-based opponent navigation when `opponent_id` is absent.
- Use design-system components and tokens; do not reintroduce large solid green/red outcome circles.
- Every material mobile UI PR must select one focused Playwright UI-review scenario.

---

## File Structure

- Create `apps/mobile/src/player-match-list.ts` — pure page-merging, match-display, and journal-prefill helpers.
- Create `apps/mobile/src/player-match-list.test.tsx` — pure helper and server-rendered row contracts.
- Create `apps/mobile/src/hooks/usePagedPlayerMatches.ts` — match paging state around `usePlayerRubbersQuery`.
- Create `apps/mobile/src/components/PlayerMatchList.tsx` — shared compact rows, row navigation, opponent action, menu, and footer.
- Create `apps/mobile/src/components/PlayerMatchList.css` — compact row layout using existing CSS custom-property tokens.
- Create `packages/design-system/src/components/ActionMenu.tsx` — shared labelled overflow actions using `BottomSheet`.
- Create `packages/design-system/src/components/action-menu-contract.test.tsx` — trigger accessibility/export contract.
- Modify `packages/design-system/src/index.ts` — export `ActionMenu` types and component.
- Modify `apps/mobile/src/PlayerPage.tsx` — shared paged list, identity removal, Quick Journal capability.
- Modify `apps/mobile/src/PlayerMatchesPage.tsx` — consume shared hook/list while retaining source filter.
- Modify `apps/mobile/src/MatchJournalPage.tsx` — validated query prefill.
- Modify `apps/mobile/src/components/MyTTSection.tsx` — hide identity choices after selection and expose Unfollow.
- Create `apps/mobile/src/components/my-tt-behavior.test.ts` — identity/following selection contracts.
- Create `apps/mobile/tests/ui-review/zz-player-match-list.pw.ts` — focused mobile visual/functional review.
- Modify `playwright.ui-review.config.ts` — select only the new scenario.

---

### Task 1: Pure Match Paging and Journal Prefill Contracts

**Files:**
- Create: `apps/mobile/src/player-match-list.test.tsx`
- Create: `apps/mobile/src/player-match-list.ts`

**Interfaces:**
- Produces: `mergePlayerMatchPage(previous, incoming, replace): RubberItem[]`
- Produces: `formatMatchResult(result, isWin): { label: string; tone: 'success' | 'danger' }`
- Produces: `formatMatchDateParts(value): { day: string; month: string; year: string }`
- Produces: `buildQuickJournalPath(playerId, match): string`
- Produces: `readJournalPrefill(searchParams, fallbackDate): { date: string; opponent: string; outcome: 'win' | 'loss' }`

- [ ] **Step 1: Write failing tests for page deduplication, result/date formatting, journal path construction, and invalid-prefill fallback**

```tsx
import { describe, expect, it } from 'vitest';
import type { RubberItem } from './player-shared';
import {
  buildQuickJournalPath,
  formatMatchDateParts,
  formatMatchResult,
  mergePlayerMatchPage,
  readJournalPrefill,
} from './player-match-list';

const match = (id: string, overrides: Partial<RubberItem> = {}): RubberItem => ({
  id,
  fixture_id: `fixture-${id}`,
  date: '2026-04-13',
  source: 'league',
  source_label: 'Brentwood & District TTL · Premier Division',
  event_id: null,
  event_name: null,
  league: 'Brentwood & District TTL',
  opponent: 'Malcolm Henstock',
  opponent_id: 'opponent-1',
  result: 'Won 3-1',
  isWin: true,
  ...overrides,
});

describe('player match list helpers', () => {
  it('appends pages without duplicate match ids', () => {
    expect(mergePlayerMatchPage([match('a'), match('b')], [match('b'), match('c')], false).map((item) => item.id))
      .toEqual(['a', 'b', 'c']);
  });

  it('replaces rows when the player or source scope changes', () => {
    expect(mergePlayerMatchPage([match('a')], [match('b')], true).map((item) => item.id))
      .toEqual(['b']);
  });

  it('uses subtle semantic result tones', () => {
    expect(formatMatchResult('Won 3-1', true)).toEqual({ label: 'Won 3-1', tone: 'success' });
    expect(formatMatchResult('Lost 0-3', false)).toEqual({ label: 'Lost 0-3', tone: 'danger' });
  });

  it('formats a compact English date block', () => {
    expect(formatMatchDateParts('2026-04-13')).toEqual({ day: '13', month: 'Apr', year: '2026' });
  });

  it('builds validated Quick Journal query parameters', () => {
    expect(buildQuickJournalPath('player-1', match('a')))
      .toBe('player/player-1/journal?date=2026-04-13&opponent=Malcolm+Henstock&outcome=win');
  });

  it('ignores invalid journal prefill values', () => {
    expect(readJournalPrefill(new URLSearchParams('date=nope&opponent=%20&outcome=practice'), '2026-08-02'))
      .toEqual({ date: '2026-08-02', opponent: '', outcome: 'win' });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: FAIL because `./player-match-list` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

```ts
import type { RubberItem } from './player-shared';

export function mergePlayerMatchPage(previous: RubberItem[], incoming: RubberItem[], replace: boolean): RubberItem[] {
  if (replace) return incoming;
  const existing = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !existing.has(item.id))];
}

export function formatMatchResult(result: string, isWin: boolean) {
  return { label: result, tone: isWin ? 'success' as const : 'danger' as const };
}

export function formatMatchDateParts(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: '--', month: '---', year: '----' };
  return {
    day: new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(parsed),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(parsed),
    year: new Intl.DateTimeFormat('en-GB', { year: 'numeric' }).format(parsed),
  };
}

function validIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildQuickJournalPath(playerId: string, match: RubberItem): string {
  const params = new URLSearchParams({
    date: match.date.slice(0, 10),
    opponent: match.opponent,
    outcome: match.isWin ? 'win' : 'loss',
  });
  return `player/${playerId}/journal?${params.toString()}`;
}

export function readJournalPrefill(searchParams: URLSearchParams, fallbackDate: string) {
  const date = searchParams.get('date');
  const opponent = searchParams.get('opponent')?.trim() ?? '';
  const outcome = searchParams.get('outcome');
  return {
    date: validIsoDate(date) ? date : fallbackDate,
    opponent,
    outcome: outcome === 'loss' ? 'loss' as const : 'win' as const,
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/player-match-list.ts apps/mobile/src/player-match-list.test.tsx
git commit -m "test: define player match list contracts"
```

---

### Task 2: Shared Paged Match Hook

**Files:**
- Create: `apps/mobile/src/hooks/usePagedPlayerMatches.ts`
- Modify: `apps/mobile/src/player-match-list.test.tsx`

**Interfaces:**
- Consumes: `mergePlayerMatchPage`
- Produces: `usePagedPlayerMatches({ playerId, source, enabled, pageSize })`
- Returns: `{ matches, total, hasMore, isLoadingInitial, isLoadingMore, error, loadMore, retry }`

- [ ] **Step 1: Add a failing source-contract test for hook defaults and reset dependencies**

```ts
import { readFileSync } from 'node:fs';

it('pages player matches in batches of twenty and resets by player/source', () => {
  const source = readFileSync(new URL('./hooks/usePagedPlayerMatches.ts', import.meta.url), 'utf8');
  expect(source).toContain('pageSize = 20');
  expect(source).toContain('[playerId, source, pageSize]');
  expect(source).toContain('mergePlayerMatchPage');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: FAIL because the hook file does not exist.

- [ ] **Step 3: Implement the paged hook using the established list-hook pattern**

```ts
import { useEffect, useMemo, useState } from 'react';
import { usePlayerRubbersQuery } from '../queries';
import { getQueryError, type RubberItem } from '../player-shared';
import { mergePlayerMatchPage } from '../player-match-list';

export type MatchSourceFilter = 'all' | 'league' | 'tournament';

interface UsePagedPlayerMatchesOptions {
  playerId: string;
  source?: MatchSourceFilter;
  enabled?: boolean;
  pageSize?: number;
}

export function usePagedPlayerMatches({
  playerId,
  source = 'all',
  enabled = true,
  pageSize = 20,
}: UsePagedPlayerMatchesOptions) {
  const [matches, setMatches] = useState<RubberItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const query = usePlayerRubbersQuery(playerId, pageSize, offset, enabled, source);

  useEffect(() => {
    setMatches([]);
    setOffset(0);
    setTotal(0);
  }, [playerId, source, pageSize]);

  useEffect(() => {
    if (!query.data) return;
    setTotal(query.data.total);
    setMatches((previous) => mergePlayerMatchPage(previous, query.data!.data, offset === 0));
  }, [offset, query.data]);

  const hasMore = useMemo(() => matches.length < total, [matches.length, total]);
  const error = getQueryError(query.error);
  const isLoadingInitial = enabled && query.isLoading && offset === 0;
  const isLoadingMore = enabled && query.isFetching && offset > 0;

  const loadMore = () => {
    if (query.isError) {
      void query.refetch();
      return;
    }
    if (!isLoadingMore && hasMore) setOffset((previous) => previous + pageSize);
  };

  return { matches, total, hasMore, isLoadingInitial, isLoadingMore, error, loadMore, retry: query.refetch };
}
```

- [ ] **Step 4: Run the focused test and mobile TypeScript build**

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
pnpm --filter @tt-players/mobile build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/usePagedPlayerMatches.ts apps/mobile/src/player-match-list.test.tsx
git commit -m "feat: add paged player match hook"
```

---

### Task 3: Design-System Action Menu

**Files:**
- Create: `packages/design-system/src/components/ActionMenu.tsx`
- Create: `packages/design-system/src/components/action-menu-contract.test.tsx`
- Modify: `packages/design-system/src/index.ts`

**Interfaces:**
- Produces: `ActionMenuItem { id, label, iconClassName, tone?, onSelect, disabled? }`
- Produces: `ActionMenu({ label, title, items, triggerClassName? })`

- [ ] **Step 1: Write a failing server-render contract test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionMenu } from './ActionMenu';

it('renders a labelled menu trigger with popup semantics', () => {
  const markup = renderToStaticMarkup(
    <ActionMenu
      label="Match actions for Malcolm Henstock"
      title="Match actions"
      items={[{ id: 'fixture', label: 'View Fixture', iconClassName: 'fa fa-angle-right', onSelect: () => undefined }]}
    />,
  );
  expect(markup).toContain('aria-label="Match actions for Malcolm Henstock"');
  expect(markup).toContain('aria-haspopup="dialog"');
  expect(markup).toContain('fa-ellipsis-v');
});
```

- [ ] **Step 2: Run the design-system test and verify RED**

```bash
pnpm --filter @tt-players/design-system test -- action-menu-contract.test.tsx
```

Expected: FAIL because `ActionMenu` does not exist.

- [ ] **Step 3: Implement `ActionMenu` on top of `BottomSheet`, `AppButton`, `DesignList`, and `ListItem`**

```tsx
import { useState } from 'react';
import { AppButton } from './AppButton';
import { BottomSheet } from './BottomSheet';
import { DesignList } from './DesignList';
import { IconCircle, ListItem } from './List';

export interface ActionMenuItem {
  id: string;
  label: string;
  iconClassName: string;
  tone?: 'accent' | 'success' | 'danger' | 'warning' | 'neutral';
  onSelect: () => void;
  disabled?: boolean;
}

export interface ActionMenuProps {
  label: string;
  title: string;
  items: ActionMenuItem[];
  triggerClassName?: string;
}

export function ActionMenu({ label, title, items, triggerClassName }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton
        tone="ghost"
        size="s"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i className="fa fa-ellipsis-v" aria-hidden="true" />
      </AppButton>
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={title} height="auto">
        <DesignList density="compact" divider="hairline" paginate={false}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              leading={<IconCircle iconClassName={item.iconClassName} tone={item.tone ?? 'neutral'} />}
              title={item.label}
              disabled={item.disabled}
              hideChevron
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            />
          ))}
        </DesignList>
      </BottomSheet>
    </>
  );
}
```

Export it from `packages/design-system/src/index.ts`.

- [ ] **Step 4: Run the focused test and design-system build**

```bash
pnpm --filter @tt-players/design-system test -- action-menu-contract.test.tsx
pnpm --filter @tt-players/design-system build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/design-system/src/components/ActionMenu.tsx packages/design-system/src/components/action-menu-contract.test.tsx packages/design-system/src/index.ts
git commit -m "feat: add shared action menu"
```

---

### Task 4: Shared Compact Player Match List

**Files:**
- Create: `apps/mobile/src/components/PlayerMatchList.tsx`
- Create: `apps/mobile/src/components/PlayerMatchList.css`
- Modify: `apps/mobile/src/player-match-list.test.tsx`

**Interfaces:**
- Consumes: `RubberItem`, `ActionMenu`, `InfiniteListFooter`, pure formatting/path helpers.
- Produces: `PlayerMatchList` with callbacks `onOpenMatch`, `onOpenOpponent`, `onQuickJournal`.

- [ ] **Step 1: Add failing server-render tests for compact semantics and conditional actions**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerMatchList } from './components/PlayerMatchList';

it('renders a compact result pill and opponent action without outcome circles', () => {
  const markup = renderToStaticMarkup(
    <PlayerMatchList
      playerId="player-1"
      matches={[match('a')]}
      total={1}
      hasMore={false}
      isLoadingInitial={false}
      isLoadingMore={false}
      error={null}
      quickJournalEnabled
      onOpenMatch={() => undefined}
      onOpenOpponent={() => undefined}
      onQuickJournal={() => undefined}
      onLoadMore={() => undefined}
      onRetry={() => undefined}
    />,
  );
  expect(markup).toContain('tt-player-match-date');
  expect(markup).toContain('Won 3-1');
  expect(markup).toContain('View Malcolm Henstock profile');
  expect(markup).toContain('Match actions for Malcolm Henstock');
  expect(markup).not.toContain('tt-outcome-badge--icon');
});

it('omits opponent navigation and Quick Journal when unavailable', () => {
  const markup = renderToStaticMarkup(
    <PlayerMatchList
      playerId="player-1"
      matches={[match('a', { opponent_id: null })]}
      total={1}
      hasMore={false}
      isLoadingInitial={false}
      isLoadingMore={false}
      error={null}
      quickJournalEnabled={false}
      onOpenMatch={() => undefined}
      onOpenOpponent={() => undefined}
      onQuickJournal={() => undefined}
      onLoadMore={() => undefined}
      onRetry={() => undefined}
    />,
  );
  expect(markup).not.toContain('View Malcolm Henstock profile');
  expect(markup).not.toContain('Quick Journal');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: FAIL because `PlayerMatchList` does not exist.

- [ ] **Step 3: Implement the shared list**

Use `DesignList density="compact" divider="hairline" paginate={false}`. Render a neutral date block in `leading`, a title containing opponent plus subtle `Pill`, source metadata in `subtitle`, and sibling trailing controls using `AppButton tone="ghost"` plus `ActionMenu`. Build menu items conditionally and pass `hideChevron` so the main row does not imply a fourth action.

The component handles:

```tsx
if (isLoadingInitial && matches.length === 0) return <SkeletonList rows={6} />;
if (error && matches.length === 0) return <ErrorState message="Failed to load match history." onRetry={onRetry} />;
if (matches.length === 0) return <EmptyState iconClassName="fa fa-table-tennis" title="No matches" message="No matches available for this player." />;
```

After rows, render loaded-count metadata, `InfiniteListFooter`, and a later-page `ErrorState` without removing existing rows.

- [ ] **Step 4: Add compact token-based CSS**

```css
.tt-player-match-date {
  align-items: center;
  background: var(--accent-subtle);
  border: 1px solid var(--border-hairline);
  border-radius: 12px;
  color: var(--ink);
  display: grid;
  flex: 0 0 48px;
  justify-items: center;
  line-height: 1;
  min-height: 54px;
  padding: 6px 4px;
}

.tt-player-match-date__day { font-size: 18px; font-weight: 800; }
.tt-player-match-date__month,
.tt-player-match-date__year { color: var(--ink-muted); font-size: 10px; }
.tt-player-match-title { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
.tt-player-match-actions { align-items: center; display: inline-flex; gap: 2px; }
.tt-player-match-action.tt-btn { height: 36px; min-height: 36px; padding: 0; width: 36px; }
```

- [ ] **Step 5: Run focused tests and mobile build**

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
pnpm --filter @tt-players/mobile build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/PlayerMatchList.tsx apps/mobile/src/components/PlayerMatchList.css apps/mobile/src/player-match-list.test.tsx
git commit -m "feat: add compact player match list"
```

---

### Task 5: Integrate Profile, Full History, Journal, and Identity

**Files:**
- Modify: `apps/mobile/src/PlayerPage.tsx`
- Modify: `apps/mobile/src/PlayerMatchesPage.tsx`
- Modify: `apps/mobile/src/MatchJournalPage.tsx`
- Modify: `apps/mobile/src/components/MyTTSection.tsx`
- Create: `apps/mobile/src/components/my-tt-behavior.test.ts`

**Interfaces:**
- Consumes: `usePagedPlayerMatches`, `PlayerMatchList`, `useMyPlayer`, `buildQuickJournalPath`, `readJournalPrefill`, `ActionMenu`.

- [ ] **Step 1: Write failing identity/following source-contract tests**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('My TT identity behaviour', () => {
  it('shows identity selection only before an identity exists and always exposes Unfollow', () => {
    const source = read('./MyTTSection.tsx');
    expect(source).toContain('!myPlayer');
    expect(source).toContain('Unfollow');
    expect(source).toContain('remove(player.id)');
  });

  it('clears identity only from the identified player profile', () => {
    const source = read('../PlayerPage.tsx');
    expect(source).toContain("This isn’t me");
    expect(source).toContain('clearMyPlayer');
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm --filter @tt-players/mobile test -- my-tt-behavior.test.ts player-match-list.test.tsx
```

Expected: FAIL because the new behaviour is not wired.

- [ ] **Step 3: Integrate `PlayerPage` without restructuring non-match sections**

- Remove the fixed `usePlayerRubbersQuery(...10...)` and inline match rendering.
- Call `usePagedPlayerMatches({ playerId, source: 'all', enabled: Boolean(playerId), pageSize: 20 })`.
- Call `useMyPlayer()` and compute `isCurrentUser = isMyPlayer(playerId)`.
- Add secondary **This isn’t me** action inside the existing `.tt-player-actions` only when `isCurrentUser`.
- Replace only the last match section body with `PlayerMatchList` and title **Recent Matches**.
- Navigate opponent with `navigateInActiveTab('player/' + opponentId)`.
- Navigate Quick Journal with `navigateInActiveTab(buildQuickJournalPath(playerId, match))`.

- [ ] **Step 4: Integrate `PlayerMatchesPage`**

Retain the All/League/Tournaments filter but replace local offset/merge state with `usePagedPlayerMatches`. Render the same `PlayerMatchList`; determine Quick Journal availability with `useMyPlayer().isMyPlayer(playerId)`.

- [ ] **Step 5: Read validated journal prefill**

```tsx
import { useParams, useSearchParams } from 'react-router-dom';
import { readJournalPrefill } from './player-match-list';

const [searchParams] = useSearchParams();
const prefill = readJournalPrefill(searchParams, today());
const [matchDate, setMatchDate] = useState(prefill.date);
const [opponent, setOpponent] = useState(prefill.opponent);
const [outcome, setOutcome] = useState<JournalOutcome>(prefill.outcome);
```

Do not submit or persist until the existing form submit runs.

- [ ] **Step 6: Update `MyTTSection`**

- Destructure `remove` from `useFavouritePlayers`.
- Keep the identified player filtered out of Following.
- Use the filtered count in the section note.
- Show the visible **This is me** action only when `!myPlayer`.
- Add an `ActionMenu` item labelled **Unfollow** that calls `remove(player.id)`.
- Once identity exists, rows expose only Unfollow and no alternative identity action.

- [ ] **Step 7: Run mobile tests and build**

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/PlayerPage.tsx apps/mobile/src/PlayerMatchesPage.tsx apps/mobile/src/MatchJournalPage.tsx apps/mobile/src/components/MyTTSection.tsx apps/mobile/src/components/my-tt-behavior.test.ts
git commit -m "feat: integrate match actions and player identity"
```

---

### Task 6: Focused Playwright UI Review

**Files:**
- Create: `apps/mobile/tests/ui-review/zz-player-match-list.pw.ts`
- Modify: `playwright.ui-review.config.ts`

**Interfaces:**
- Exercises: identified-player profile, compact recent matches, opponent action, overflow menu, Quick Journal prefill, infinite-scroll loading.

- [ ] **Step 1: Create the focused scenario using the existing manifest/report helpers**

The scenario must:

1. Set onboarding/theme local storage and set `tt_players_my_player` to a representative player discovered from `/api/players/search`.
2. Open that player profile and wait for `/api/players/{id}/rubbers?limit=20&offset=0&source=all`.
3. Assert the existing `.tt-player-hero` remains visible.
4. Assert `.tt-player-match-date` rows exist and `.tt-outcome-badge--icon` does not exist in the Recent Matches section.
5. Assert the first available opponent-profile action and overflow trigger are visible.
6. Open the overflow menu, select Quick Journal, and assert date/opponent/outcome are prefilled.
7. Return to the profile, scroll the sentinel into view, and assert an offset-20 request occurs when at least 20 matches are available.
8. Capture one compact-list screenshot and one Quick Journal screenshot.

- [ ] **Step 2: Select only the new scenario**

```ts
// PR #86 only. For the next UI PR, replace this filename; do not append to it.
testMatch: 'zz-player-match-list.pw.ts',
```

- [ ] **Step 3: Validate Playwright collection and run the focused scenario**

```bash
pnpm exec playwright test --config=playwright.ui-review.config.ts --list
PREVIEW_URL=http://localhost:7474 pnpm exec playwright test --config=playwright.ui-review.config.ts
```

Expected: the list contains only `zz-player-match-list.pw.ts`; the scenario passes against a running preview.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/tests/ui-review/zz-player-match-list.pw.ts playwright.ui-review.config.ts
git commit -m "test: review compact player match flow"
```

---

### Task 7: Full Verification and PR Update

**Files:**
- Modify: PR #86 metadata only.

- [ ] **Step 1: Run all relevant local gates**

```bash
pnpm --filter @tt-players/design-system test
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm exec playwright test --config=playwright.ui-review.config.ts --list
```

Expected: all commands pass with no TypeScript errors or Vitest failures.

- [ ] **Step 2: Inspect the final diff for unintended profile changes**

```bash
git diff main...HEAD -- apps/mobile/src/PlayerPage.tsx apps/mobile/src/app-shell.css
```

Expected: non-match profile sections retain their existing structure; only the existing action row gains identity removal.

- [ ] **Step 3: Update PR #86 title and body**

Use title:

```text
Improve player match history and identity actions
```

Body must summarize compact shared rows, 20-item infinite paging, opponent/profile/menu actions, Quick Journal prefill, identity/follow separation, and focused UI-review coverage.

- [ ] **Step 4: Confirm GitHub checks and screenshot report**

Wait for Mobile CI, design-system checks, production build, and focused Playwright screenshot workflow. Investigate any failure before declaring the PR ready.
