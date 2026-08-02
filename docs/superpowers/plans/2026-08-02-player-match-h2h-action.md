# Player Match H2H Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make player match rows open the match by default, expose the opponent name as a separate profile action, and add a visible H2H shortcut without using overflow.

**Architecture:** Extend the shared `ListItem`/`MatchRecordRow` primitives with a split-action layout that uses a stretched primary row button plus independent title and trailing controls, avoiding nested interactive elements. Wire the player match list to the existing tab navigation system and add the missing direct H2H tab route.

**Tech Stack:** React 18, TypeScript, React Router, shared TT Players design system, Vitest static-render contract tests, Playwright UI review.

## Global Constraints

- Do not use an overflow menu, swipe actions, bottom sheet, or inline H2H text chip.
- Tapping the non-interactive row surface opens the source fixture or tournament event.
- Tapping the opponent name opens the opponent profile.
- Use one visible `fa-people-arrows` H2H action when `opponent_id` exists.
- Current-user rows show Quick Journal followed by H2H; other-player rows show H2H only.
- Keep at most two trailing row actions.
- Missing opponent ids suppress profile and H2H actions but preserve match-row navigation.
- Preserve separate keyboard-focusable controls and never nest buttons or links.

---

## File Structure

- Modify `packages/design-system/src/components/List.tsx` — add the accessible stretched-primary/title-action layout to the shared list item.
- Modify `packages/design-system/src/components/MatchRecordRow.tsx` — expose row labels and title actions through the match-row API.
- Modify `packages/design-system/src/components/MatchRecordRow.css` — style the split interaction layers and focus treatment.
- Modify `apps/mobile/src/components/PlayerMatchList.tsx` — apply match, opponent, journal, and H2H behavior.
- Modify `apps/mobile/src/PlayerPage.tsx` — navigate profile-preview match rows into H2H.
- Modify `apps/mobile/src/PlayerMatchesPage.tsx` — navigate full-history match rows into H2H.
- Modify `apps/mobile/src/AppRouter.tsx` — register the direct tab-scoped H2H route.
- Modify `apps/mobile/src/player-match-list.test.tsx` — lock the new static interaction contract.
- Modify `apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts` — verify all destinations independently at mobile viewport sizes.

---

### Task 1: Add accessible split actions to shared match rows

**Files:**
- Modify: `packages/design-system/src/components/List.tsx`
- Modify: `packages/design-system/src/components/MatchRecordRow.tsx`
- Modify: `packages/design-system/src/components/MatchRecordRow.css`
- Test: `apps/mobile/src/player-match-list.test.tsx`

**Interfaces:**
- `ListItem` consumes optional `primaryActionLabel: string` and `titleAction: { label: string; onClick: () => void }`.
- `MatchRecordRow` exposes matching `primaryActionLabel` and `titleAction` props.
- When `onClick`, `primaryActionLabel`, and `titleAction` are present, the row renders a stretched primary button and an independent title button.
- Existing list items without `titleAction` retain their current DOM and behavior.

- [ ] **Step 1: Write the failing split-action markup test**

Update the `PlayerMatchList` static-render expectations in `apps/mobile/src/player-match-list.test.tsx` so a row with an opponent id must contain separate primary and title controls:

```tsx
it('renders separate match and opponent controls without nested actions', () => {
  const markup = renderList(false);

  expect(markup).toContain('tt-list-item__stretched-action');
  expect(markup).toContain('aria-label="View fixture for match against Malcolm Henstock"');
  expect(markup).toContain('tt-list-item__title-action');
  expect(markup).toContain('aria-label="Open Malcolm Henstock profile"');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: FAIL because the stretched row action and title-action classes do not exist.

- [ ] **Step 3: Extend the `ListItem` public interface**

Add these types to `List.tsx`:

```tsx
export interface ListItemTitleAction {
  label: string;
  onClick: () => void;
}

export interface ListItemProps {
  // existing props
  primaryActionLabel?: string;
  titleAction?: ListItemTitleAction;
}
```

Destructure both props in `ListItem` and compute:

```tsx
const usesSplitActions = Boolean(onClick && primaryActionLabel && titleAction && !href);
```

- [ ] **Step 4: Implement the split-action DOM without nested controls**

For `usesSplitActions`, render this structure instead of the existing wrapped button:

```tsx
const splitContent = (
  <div className="tt-list-item__clickable tt-list-item__clickable--split" aria-hidden="true">
    {leading ? <span className="tt-list-item__leading">{leading}</span> : null}
    <span className="tt-list-item__content">
      <span className="tt-list-item__title tt-list-item__title--placeholder">{title}</span>
      {subtitle ? <span className="tt-list-item__subtitle">{subtitle}</span> : null}
    </span>
  </div>
);

return (
  <div className={cx('tt-list-item', 'tt-list-item--split-actions', className)}>
    <button
      type="button"
      className="tt-list-item__stretched-action"
      aria-label={primaryActionLabel}
      onClick={handleNavigate}
    />
    {splitContent}
    <button
      type="button"
      className="tt-list-item__title-action"
      aria-label={titleAction.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        titleAction.onClick();
      }}
    >
      {title}
    </button>
    {trailingEl ? <span className="tt-list-item__trailing">{trailingEl}</span> : null}
  </div>
);
```

Keep the current rendering path unchanged for all other `ListItem` combinations. Preserve `active` and `disabled` classes in the split branch, and disable the stretched button when `disabled` is true.

- [ ] **Step 5: Add split-action styling and focus treatment**

In `MatchRecordRow.css`, add scoped rules for match rows:

```css
.tt-match-record-row.tt-list-item--split-actions {
  position: relative;
}

.tt-match-record-row .tt-list-item__stretched-action {
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
  inset: 0;
  padding: 0;
  position: absolute;
  width: 100%;
  z-index: 1;
}

.tt-match-record-row .tt-list-item__clickable--split {
  pointer-events: none;
  position: relative;
  z-index: 2;
}

.tt-match-record-row .tt-list-item__title--placeholder {
  visibility: hidden;
}

.tt-match-record-row .tt-list-item__title-action {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  left: var(--list-leading-and-gap, 68px);
  max-width: calc(100% - var(--list-leading-and-gap, 68px) - 96px);
  overflow: hidden;
  padding: 0;
  position: absolute;
  text-align: left;
  text-overflow: ellipsis;
  top: var(--match-record-title-top, 15px);
  white-space: nowrap;
  z-index: 3;
}

.tt-match-record-row .tt-list-item__trailing {
  position: relative;
  z-index: 3;
}

.tt-match-record-row .tt-list-item__stretched-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tt-match-record-row .tt-list-item__title-action:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

Use the actual existing list spacing values from computed design-system tokens while implementing; keep the title aligned exactly with the current title position at compact and standard density. Do not reduce the current 38×38 action targets.

- [ ] **Step 6: Expose the split props from `MatchRecordRow`**

Add to `MatchRecordRowProps`:

```tsx
primaryActionLabel?: string;
titleAction?: {
  label: string;
  onClick: () => void;
};
```

Pass them through to `ListItem`:

```tsx
<ListItem
  // existing props
  onClick={onClick}
  primaryActionLabel={primaryActionLabel}
  titleAction={titleAction}
/>
```

- [ ] **Step 7: Run focused tests and the mobile build**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
pnpm --filter @tt-players/mobile build
```

Expected: test PASS and TypeScript/Vite build PASS.

- [ ] **Step 8: Commit the shared interaction primitive**

```bash
git add packages/design-system/src/components/List.tsx \
  packages/design-system/src/components/MatchRecordRow.tsx \
  packages/design-system/src/components/MatchRecordRow.css \
  apps/mobile/src/player-match-list.test.tsx
git commit -m "feat(design-system): support split match row actions"
```

---

### Task 2: Rewire player match rows and add direct H2H navigation

**Files:**
- Modify: `apps/mobile/src/components/PlayerMatchList.tsx`
- Modify: `apps/mobile/src/PlayerPage.tsx`
- Modify: `apps/mobile/src/PlayerMatchesPage.tsx`
- Modify: `apps/mobile/src/AppRouter.tsx`
- Test: `apps/mobile/src/player-match-list.test.tsx`

**Interfaces:**
- `PlayerMatchListProps` gains `onOpenH2H: (opponentId: string) => void`.
- The row calls `onOpenMatch(match)` through its stretched primary action.
- The title action calls `onOpenOpponent(opponentId)`.
- The H2H trailing action calls `onOpenH2H(opponentId)`.

- [ ] **Step 1: Replace the old row-action assertions with the new contract**

Update `apps/mobile/src/player-match-list.test.tsx` callbacks:

```tsx
const callbacks = {
  onOpenMatch: () => undefined,
  onOpenOpponent: () => undefined,
  onOpenH2H: () => undefined,
  onQuickJournal: () => undefined,
  onLoadMore: () => undefined,
  onRetry: () => undefined,
};
```

Replace the existing action tests with assertions covering these exact labels:

```tsx
it('uses the row for the match and exposes profile plus H2H for known opponents', () => {
  const markup = renderList(false);

  expect(markup).toContain('View fixture for match against Malcolm Henstock');
  expect(markup).toContain('Open Malcolm Henstock profile');
  expect(markup).toContain('Open head to head with Malcolm Henstock');
  expect(markup).toContain('fa-people-arrows');
  expect(markup).not.toContain('fa-calendar');
});

it('shows Quick Journal followed by H2H for my matches', () => {
  const markup = renderList(true);

  expect(markup).toContain('Journal match against Malcolm Henstock');
  expect(markup).toContain('Open head to head with Malcolm Henstock');
  expect(markup.indexOf('Journal match against Malcolm Henstock'))
    .toBeLessThan(markup.indexOf('Open head to head with Malcolm Henstock'));
});

it('omits profile and H2H actions when the opponent id is unavailable', () => {
  const markup = renderList(false, matchFixture('missing-opponent', { opponent_id: null }));

  expect(markup).toContain('View fixture for match against Malcolm Henstock');
  expect(markup).not.toContain('Open Malcolm Henstock profile');
  expect(markup).not.toContain('Open head to head with Malcolm Henstock');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
```

Expected: FAIL because the list still uses the row for the opponent and the calendar action for match navigation.

- [ ] **Step 3: Add the H2H callback to `PlayerMatchList`**

Add to `PlayerMatchListProps` and destructuring:

```tsx
onOpenH2H: (opponentId: string) => void;
```

Build trailing actions in this order:

```tsx
const actions = [
  ...(quickJournalEnabled ? [{
    iconClassName: 'fa fa-pen',
    label: `Journal match against ${match.opponent}`,
    onClick: () => onQuickJournal(match),
    tone: 'accent' as const,
  }] : []),
  ...(opponentId ? [{
    iconClassName: 'fa fa-people-arrows',
    label: `Open head to head with ${match.opponent}`,
    onClick: () => onOpenH2H(opponentId),
    tone: 'neutral' as const,
  }] : []),
];
```

Remove the calendar/event trailing action entirely.

Configure `MatchRecordRow` as:

```tsx
<MatchRecordRow
  // score and metadata unchanged
  title={match.opponent}
  onClick={() => onOpenMatch(match)}
  primaryActionLabel={`View ${destination} for match against ${match.opponent}`}
  titleAction={opponentId ? {
    label: `Open ${match.opponent} profile`,
    onClick: () => onOpenOpponent(opponentId),
  } : undefined}
  actions={actions}
/>
```

When `opponentId` is absent, keep `onClick` and `primaryActionLabel`, but omit `titleAction` and H2H.

- [ ] **Step 4: Wire H2H navigation from both player pages**

In `PlayerPage.tsx` and `PlayerMatchesPage.tsx`, add:

```tsx
const openH2H = (opponentId: string) => {
  navigateInTab('h2h', `h2h/${playerId}/${opponentId}`);
};
```

Pass it into each `PlayerMatchList`:

```tsx
onOpenH2H={openH2H}
```

- [ ] **Step 5: Register the direct H2H tab route**

In `AppRouter.tsx`, add this route before the common-opponents route and before the wildcard:

```tsx
<Route
  path="/tabs/:tabId/h2h/:playerAId/:playerBId"
  element={<EnsureValidTab><H2HPage /></EnsureValidTab>}
/>
```

Retain the existing `/h2h/:playerAId/:playerBId` public route and the tab-scoped common-opponents route.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
pnpm --filter @tt-players/mobile test -- player-match-list.test.tsx
pnpm --filter @tt-players/mobile build
```

Expected: PASS. The build must confirm every `PlayerMatchList` call site supplies `onOpenH2H`.

- [ ] **Step 7: Commit the player-row behavior**

```bash
git add apps/mobile/src/components/PlayerMatchList.tsx \
  apps/mobile/src/PlayerPage.tsx \
  apps/mobile/src/PlayerMatchesPage.tsx \
  apps/mobile/src/AppRouter.tsx \
  apps/mobile/src/player-match-list.test.tsx
git commit -m "feat(mobile): open H2H from player match rows"
```

---

### Task 3: Verify independent mobile interactions in Playwright

**Files:**
- Modify: `apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts`

**Interfaces:**
- Uses accessible labels introduced in Task 2.
- Uses the existing `openPlayer` and API-discovery helpers.
- Produces updated screenshots for current-user and other-player match rows.

- [ ] **Step 1: Update row action visibility assertions**

For a current-user row, assert:

```tsx
await expect(firstRow.getByRole('button', { name: /Journal match against/ })).toBeVisible();
await expect(firstRow.getByRole('button', { name: /Open head to head with/ })).toBeVisible();
await expect(firstRow.getByRole('button', { name: /View (?:fixture|event) for match against/ })).toBeVisible();
await expect(firstRow.locator('.fa-calendar')).toHaveCount(0);
```

For another player’s row, assert Journal is absent while H2H and the primary row action remain visible.

- [ ] **Step 2: Verify the opponent title action independently**

Click:

```tsx
await firstRow.getByRole('button', { name: `Open ${opponentName} profile` }).click();
await expect(page).toHaveURL(new RegExp(`/tabs/players/player/${opponentId}(?:$|[/?#])`));
```

Reopen the original player after this assertion.

- [ ] **Step 3: Verify the primary row action independently**

Use the first match’s `source`, `fixture_id`, and `event_id` from the rubbers payload. Click the button labelled `View fixture...` or `View event...`, then assert:

```tsx
const expectedPath = firstMatch!.source === 'tournament' && firstMatch!.event_id
  ? `/tabs/players/event/${firstMatch!.event_id}`
  : `/tabs/leagues/fixture/${firstMatch!.fixture_id}`;
await expect(page).toHaveURL(new RegExp(`${expectedPath}(?:$|[/?#])`));
```

Reopen the original player after this assertion.

- [ ] **Step 4: Verify H2H navigation and direct tab route**

Click:

```tsx
await firstRow.getByRole('button', { name: `Open head to head with ${opponentName}` }).click();
await expect(page).toHaveURL(new RegExp(`/tabs/h2h/h2h/${player.id}/${opponentId}(?:$|[/?#])`));
await expect(page.getByRole('heading', { name: /vs/i }).first()).toBeVisible({ timeout: 30_000 });
```

Confirm the H2H bottom tab is active and capture a review screenshot if the existing report structure benefits from it.

- [ ] **Step 5: Preserve the Quick Journal verification**

Reopen the player, restore `tt_players_my_player`, click the Journal action, and retain the existing query-prefill assertions.

- [ ] **Step 6: Run the focused UI review**

Build and serve the preview using the repository’s existing UI-review workflow, then run:

```bash
pnpm exec playwright test apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts
```

Expected: PASS for all configured mobile projects. Review screenshots at the narrowest viewport to confirm names truncate cleanly and both current-user actions remain comfortable.

- [ ] **Step 7: Run final verification**

Run:

```bash
pnpm --filter @tt-players/mobile test
pnpm --filter @tt-players/mobile build
```

Expected: all mobile Vitest tests PASS and the production build PASS.

- [ ] **Step 8: Commit UI verification**

```bash
git add apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts
git commit -m "test(ui): verify direct player match row actions"
```

---

## Self-Review

- Spec coverage: row, opponent, H2H, Journal, missing-opponent behavior, direct tab route, accessibility, and mobile review all have explicit implementation tasks.
- Placeholder scan: no deferred implementation steps or unspecified tests remain.
- Type consistency: `onOpenH2H(opponentId)`, `primaryActionLabel`, and `titleAction` use the same names across the design system, mobile component, call sites, and tests.
- Scope: no rating-history or unrelated match-record changes are included.