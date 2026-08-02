# Selected Tournament Player Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide unrelated tournament players after a player is selected, while preserving player and round result filtering.

**Architecture:** Keep `selectedPlayer` as the single source of truth in `EventDetailPage`. Branch the Players section into two modes: a compact selected-player state or the normal browsing state. Add a source contract test that fails until the selected branch owns the active filter UI and the browsing controls are moved into the unselected branch.

**Tech Stack:** React 18, TypeScript, Vitest, existing TT Players design-system components.

## Global Constraints

- Do not change the tournament API or data model.
- Keep the selected-player and selected-round filters composable.
- Keep favourite-player behaviour unchanged.
- Keep the Most wins section unchanged apart from entering the shared selected-player state.
- Use existing design-system components only.

---

### Task 1: Define the selected-player rendering contract

**Files:**
- Create: `apps/mobile/src/tournament-player-filter.contract.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/src/EventDetailPage.tsx` source.
- Produces: a regression contract requiring the Players section to have distinct selected and browsing branches.

- [ ] **Step 1: Write the failing source contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./EventDetailPage.tsx', import.meta.url), 'utf8');

describe('tournament selected-player filter', () => {
  it('replaces player browsing controls with one selected-player row', () => {
    expect(source).toContain('selectedPlayer ? (\n                      <DesignList density="compact" divider="hairline" paginate={false}>');
    expect(source).toContain('title={selectedPlayer.name}');
    expect(source).toContain('subtitle="Filtering recorded matches"');
    expect(source).toContain('Clear player');
    expect(source).toContain(') : (\n                      <>\n                        <AppSearchInput');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @tt-players/mobile test -- tournament-player-filter.contract.test.ts`

Expected: FAIL because the current Players section renders search and the full list even when `selectedPlayer` is set.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/mobile/src/tournament-player-filter.contract.test.ts
git commit -m "test: define selected tournament player state"
```

### Task 2: Implement the compact selected-player state

**Files:**
- Modify: `apps/mobile/src/EventDetailPage.tsx`

**Interfaces:**
- Consumes: `selectedPlayer`, `setSelectedPlayer`, existing player browsing controls.
- Produces: selected mode with one compact row and browsing mode with search, All/Undefeated filters, empty state, and paginated player list.

- [ ] **Step 1: Move browsing controls into the unselected branch**

Render this structure inside the Players section:

```tsx
{selectedPlayer ? (
  <DesignList density="compact" divider="hairline" paginate={false}>
    <ListItem
      leading={<DesignAvatar size="compact" text={getInitials(selectedPlayer.name)} />}
      title={selectedPlayer.name}
      subtitle="Filtering recorded matches"
      trailing={(
        <AppButton size="sm" tone="ghost" onClick={() => setSelectedPlayer(null)}>
          Clear player
        </AppButton>
      )}
      active
      hideChevron
    />
  </DesignList>
) : (
  <>
    <AppSearchInput ... />
    <FilterBar ...>...</FilterBar>
    {filteredTournamentPlayers.length === 0 ? (...) : (...)}
  </>
)}
```

Remove the old separate `Matches for ...` pill row. Do not change `filteredResults`, `groupedResults`, `togglePlayerFilter`, or round-filter state.

- [ ] **Step 2: Run the focused test and verify GREEN**

Run: `pnpm --filter @tt-players/mobile test -- tournament-player-filter.contract.test.ts`

Expected: PASS.

- [ ] **Step 3: Run mobile tests and build**

Run:

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
pnpm run check:design-system
```

Expected: all commands pass without warnings or TypeScript errors.

- [ ] **Step 4: Commit the implementation**

```bash
git add apps/mobile/src/EventDetailPage.tsx
git commit -m "fix: hide unselected tournament players"
```

### Task 3: Review and delivery

**Files:**
- Review: `apps/mobile/src/EventDetailPage.tsx`
- Review: `apps/mobile/src/tournament-player-filter.contract.test.ts`

- [ ] **Step 1: Review the diff against the approved design**

Confirm that selected mode hides search, All/Undefeated, empty state, and the paginated player list; clearing restores them; the result and round filters are unchanged.

- [ ] **Step 2: Verify repository CI**

Confirm the pull-request checks pass for the final commit.

- [ ] **Step 3: Open the pull request**

Use title: `Hide unrelated tournament players when filtering`

Describe the selected mode, clear behaviour, unchanged round composition, and test coverage.
