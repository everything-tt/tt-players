# Player Following Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the league-scoped Players browse screen with a personal My player/Following default view and global player search.

**Architecture:** Keep membership in local `useFavouritePlayers` state, fetch current followed-player summaries through the existing paginated `saved_ids` API, and use a small pure view-model helper to select default, short-query, or search modes. Recompose `PlayersTabContent` entirely from existing design-system primitives and make the root-header league action optional so it is absent on Players.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Vite, pnpm workspace, `@tt-players/design-system`

## Global Constraints

- Search is global and must never send `league_ids`.
- Empty search shows My player when configured and followed players.
- One/two-character queries do not fetch; three or more characters use global paginated search.
- Initial and subsequent page sizes remain 10.
- The current player must not be duplicated in Following.
- Use existing design-system components only; add no page-specific CSS.
- Hide the root-header league action only on the Players root tab.

---

### Task 1: Define and test the Players view model

**Files:**
- Create: `apps/mobile/src/players-tab-model.ts`
- Create: `apps/mobile/src/players-tab-model.test.ts`

**Interfaces:**
- Produces: `getPlayersTabMode(query: string, minSearchLength?: number): 'following' | 'short-query' | 'search'`
- Produces: `getFollowedPlayerIds(players: Array<{ id: string }>, myPlayerId?: string | null): string[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { getFollowedPlayerIds, getPlayersTabMode } from './players-tab-model';

describe('players tab model', () => {
  it('shows following for an empty query', () => {
    expect(getPlayersTabMode('   ')).toBe('following');
  });

  it('shows the short-query state before three characters', () => {
    expect(getPlayersTabMode('ab')).toBe('short-query');
  });

  it('shows global search from three characters', () => {
    expect(getPlayersTabMode('abc')).toBe('search');
  });

  it('excludes the current player from followed ids without reordering the rest', () => {
    expect(getFollowedPlayerIds(
      [{ id: 'first' }, { id: 'me' }, { id: 'third' }],
      'me',
    )).toEqual(['first', 'third']);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @tt-players/mobile test -- players-tab-model.test.ts
```

Expected: FAIL because `./players-tab-model` does not exist.

- [ ] **Step 3: Implement the minimal helper**

```ts
export type PlayersTabMode = 'following' | 'short-query' | 'search';

export function getPlayersTabMode(query: string, minSearchLength = 3): PlayersTabMode {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return 'following';
  return normalizedQuery.length < minSearchLength ? 'short-query' : 'search';
}

export function getFollowedPlayerIds(
  players: Array<{ id: string }>,
  myPlayerId?: string | null,
): string[] {
  return players
    .filter((player) => player.id !== myPlayerId)
    .map((player) => player.id);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter @tt-players/mobile test -- players-tab-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/players-tab-model.ts apps/mobile/src/players-tab-model.test.ts
git commit -m "test: define player hub view modes"
```

---

### Task 2: Recompose the Players root content

**Files:**
- Modify: `apps/mobile/src/PlayersTabContent.tsx`

**Interfaces:**
- Consumes: `getPlayersTabMode` and `getFollowedPlayerIds` from Task 1.
- Consumes: `useMyPlayer`, `useFavouritePlayers`, `usePlayerList`, and existing design-system primitives.
- Produces: `PlayersTabContent({ onOpenPlayer }: { onOpenPlayer(playerId: string): void })`.

- [ ] **Step 1: Replace league/saved mode state with personal and search inputs**

Make `PlayersTabContentProps` contain only `onOpenPlayer`. Remove `scope`, `savedOnly`, selected-league props, and the segmented control/Saved toggle imports.

Add:

```ts
const search = useSearch({ minLength: 3, resetOnDisable: false });
const { player: myPlayer } = useMyPlayer();
const { players: favouritePlayers, isFavourite, toggle: toggleFavourite } = useFavouritePlayers();
const mode = getPlayersTabMode(search.normalizedQuery);
const followedIds = useMemo(
  () => getFollowedPlayerIds(favouritePlayers, myPlayer?.id),
  [favouritePlayers, myPlayer?.id],
);
```

- [ ] **Step 2: Add separate paginated lists for Following and global search**

```ts
const followingList = usePlayerList({
  search: '',
  leagueIds: [],
  savedIds: followedIds,
  pageSize: PAGE_SIZE,
  enabled: mode === 'following' && followedIds.length > 0,
});

const searchList = usePlayerList({
  search: search.debouncedQuery,
  leagueIds: [],
  savedIds: [],
  pageSize: PAGE_SIZE,
  enabled: mode === 'search',
});
```

Filter rendered Following rows through `isFavourite(player.id)` so an unfollow action removes the row immediately.

- [ ] **Step 3: Render the global search field using the design system**

```tsx
<SearchToolbar ariaLabel="Search all players">
  <AppSearchInput
    inputMode="search"
    enterKeyHint="search"
    autoComplete="off"
    placeholder="Search all players…"
    aria-label="Search all players"
    value={search.query}
    onChange={(event) => search.setQuery(event.target.value)}
  />
</SearchToolbar>
```

Do not supply a toolbar action.

- [ ] **Step 4: Render optional My player content**

When `mode === 'following' && myPlayer`, render compact `PageSection` / `DesignList` content with:

```tsx
<ListItem
  leading={<DesignAvatar size="compact" text={getInitials(myPlayer.name)} />}
  title={myPlayer.name}
  subtitle="Your player profile"
  onClick={() => onOpenPlayer(myPlayer.id)}
  trailing={<Pill tone="accent">You</Pill>}
/>
```

- [ ] **Step 5: Render Following states and rows**

For empty Following membership, render:

```tsx
<EmptyState
  iconClassName="fa fa-heart-o"
  title="No followed players yet"
  message="Search for any player above, then tap the heart to follow them here."
/>
```

For loading, error, success, pagination, and end states, use the same `EmptyState`, `ErrorState`, `DesignList`, `ListItem`, `FavouriteButton`, and `InfiniteListFooter` patterns already present in the component. The section title is `Following`; metadata is `${followedIds.length} players` when non-empty.

- [ ] **Step 6: Render short-query and global-search states**

Short query:

```tsx
<EmptyState
  iconClassName="fa fa-keyboard"
  title="Type at least 3 characters"
  message="Keep typing to search every player in the system."
/>
```

Global search uses `searchList`, title `Search results`, current result-count metadata, the normalized query in the no-results message, and the existing paginated row/footer pattern.

- [ ] **Step 7: Run mobile tests and build**

Run:

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/PlayersTabContent.tsx
git commit -m "feat: make players a following-first global search hub"
```

---

### Task 3: Remove irrelevant league controls from the Players tab

**Files:**
- Modify: `apps/mobile/src/components/RootHeader.tsx`
- Modify: `apps/mobile/src/App.tsx`

**Interfaces:**
- `RootHeaderProps.onOpenLeagues` becomes optional.
- Players passes only `onOpenPlayer` to `PlayersTabContent`.

- [ ] **Step 1: Make the root league action optional**

Change:

```ts
onOpenLeagues?: () => void;
```

Render the filter button only when `onOpenLeagues` exists. Keep its current badge and accessible label behaviour unchanged for other tabs.

- [ ] **Step 2: Hide the league action on Players and simplify Players props**

In `App.tsx`, pass:

```tsx
onOpenLeagues={activeTab === 'players' ? undefined : openLeagueSelector}
```

Replace the Players component call with:

```tsx
<PlayersTabContent
  onOpenPlayer={(playerId) => navigateInActiveTab(`player/${playerId}`)}
/>
```

- [ ] **Step 3: Run type/build and design-system verification**

Run:

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm run check:design-system
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/RootHeader.tsx apps/mobile/src/App.tsx
git commit -m "fix: hide league filtering from the players hub"
```

---

### Task 4: Final regression review

**Files:**
- Review only: all changed files

- [ ] **Step 1: Confirm the diff is scoped**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Expected: only the approved spec/plan, Players view-model/test, Players content, RootHeader, and App integration are changed.

- [ ] **Step 2: Run the final verification suite**

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm run check:design-system
```

Expected: all commands exit 0 with no TypeScript errors.

- [ ] **Step 3: Create the PR**

Use title:

```text
Make Players a following-first global search hub
```

The PR body must explain:

- default My player + Following experience;
- global unscoped search;
- removal of scope tabs and Saved toggle;
- removal of the irrelevant league-filter header action;
- design-system reuse;
- tests and build commands run.
