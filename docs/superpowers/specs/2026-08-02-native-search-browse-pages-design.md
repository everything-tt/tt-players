# Native Search Browse Pages Design

**Date:** 2026-08-02  
**Status:** Proposed for implementation  
**Scope:** Mobile Players and Tournaments root tabs, shared design-system controls, and supporting list APIs

## 1. Intent

Replace the large hero-style search treatment on the Players and Tournaments root tabs with a compact, native-app browse pattern.

Both screens should make the active scope obvious, keep search close to the list it affects, support saved-only filtering without a separate saved section, and progressively load results as the user scrolls.

Pagination applies to every result mode: the default browse list, typed search results, Saved-only results, and Saved plus search results. No mode may silently truncate a large matching result set.

The root header remains the page title. The content must not repeat the title in a hero card.

## 2. Chosen interaction model

The shared vertical structure is:

1. compact segmented scope control;
2. compact search toolbar with a search field and a labelled Saved toggle;
3. one active result list;
4. automatic progressive-loading footer and explicit retry/end states.

The Saved control is a filter, not a navigation destination. It uses both an icon and the label `Saved`, has a minimum 44px touch target, and exposes pressed/selected semantics.

Row-level favourite buttons remain available so users can add or remove saved entities without leaving the list.

Every active result set initially displays 10 items. When more matching items exist, scrolling toward the bottom loads the next page of 10. This behaviour is identical before and after entering a search query.

## 3. Shared design-system architecture

### 3.1 Page composition

Continue using `BrowsePage` as the generic page shell. Do not introduce a search-specific page type.

Add `SearchToolbar` to `packages/design-system`:

- composes the canonical `AppSearchInput`;
- accepts one or more optional trailing actions;
- supports a full-width input with a compact trailing action on narrow phones;
- preserves a minimum 44px control height;
- owns spacing, alignment, focus treatment, and responsive behaviour;
- does not own query state, fetching, list state, or domain semantics.

Add `AppToggleButton` to the design system for persistent filter states. It supports `aria-pressed`, icon plus label, inactive outline treatment, active tinted treatment, disabled state, and the same size tokens as `AppButton`.

The segmented scope control continues to use `SegmentedToggle`.

### 3.2 Product-level composition

The mobile app composes:

- `BrowsePage` or the existing root shell content area;
- `SegmentedToggle`;
- `SearchToolbar`;
- `AppToggleButton` for Saved;
- `DesignList` / `ListItem`;
- `InfiniteListFooter`;
- shared loading, empty, and error states.

Remove `SearchPanel` from the Players and Tournaments root tabs. Delete it only if no remaining screen uses it after migration.

## 4. Tournaments screen

### 4.1 Scope tabs

Use two lifecycle tabs:

- `Upcoming`
- `Completed`

`Upcoming` is selected initially.

Each tab owns independent list state:

- loaded items;
- next-page state;
- loading and error state;
- scroll position;
- whether the tab has been opened.

The inactive tab is not fetched until first opened. Returning to a tab restores its loaded items and scroll position.

### 4.2 Search and Saved filtering

The toolbar contains:

- context-sensitive placeholder:
  - `Search upcoming tournaments…`
  - `Search completed tournaments…`
- `Saved` toggle.

Search requests are made only for the active lifecycle tab. The query text remains when switching tabs so the same tournament name can be checked in both scopes.

Saved filtering is applied within the active lifecycle tab. For example, `Completed + Saved + Birmingham` means completed saved tournaments matching `Birmingham`.

The existing separate `Saved Tournaments` section is removed.

### 4.3 Pagination

- Initial page size: 10.
- Pagination applies equally to unfiltered lists, text-search results, Saved-only results, and combined Saved plus text-search results.
- Additional pages load automatically when the footer approaches the viewport.
- Each additional page contains up to 10 more matching tournaments.
- Only one load-more request may be active for a tab and filter key.
- A query, lifecycle-tab, or Saved-filter change starts a new paginated result set from page one.
- Duplicate rows are prevented by tournament ID.
- A failed load-more request preserves existing rows and exposes a retry action.
- The footer shows a clear end state only when every matching tournament for the current tab, query, and Saved state has been loaded.
- The server response must provide reliable `has_more`, total, cursor, or equivalent pagination metadata; the client must not infer completion merely because an earlier fixed search limit was reached.

### 4.4 Empty states

Define distinct messages for:

- no tournaments in the active lifecycle scope;
- no search matches;
- no saved tournaments in the active lifecycle scope;
- no saved tournaments matching the active query.

## 5. Players screen

### 5.1 Scope tabs

Use the existing league scopes as compact top tabs:

- `All leagues`
- `Selected`

`All leagues` is selected initially.

The `Selected` tab remains available when no leagues are selected, but shows a useful empty state with an action to open league selection rather than silently behaving like `All leagues`.

Each scope owns independent list and scroll state. Only the active scope is queried. The current search text remains when switching scope so the same player can be checked across both scopes.

### 5.2 Search and Saved filtering

The toolbar contains:

- placeholder `Search players…`;
- `Saved` toggle.

Saved is an additional filter within the active league scope, not a separate saved section. The former `Favourite Players` section is removed.

The active query, league scope, and saved-only state form one request scope. Saved-only results must be accurate for `Selected`, rather than ignoring the league filter.

Extend the player-search API with an optional `saved_ids` parameter containing comma-separated canonical player UUIDs. Validate every UUID and cap the list at 200 IDs. The API intersects those IDs with the active league scope and query before ordering and pagination.

When no players are saved, enabling Saved immediately shows a purposeful empty state while keeping row-level favourite actions available after the filter is cleared.

### 5.3 Blank and short-query behaviour

With an empty query, show the existing recent/active-player browse result, starting with 10 players. This turns the page into a useful browse screen instead of an empty search prompt.

Preserve the current performance guard for typed search:

- empty query: load browse results;
- one or two non-whitespace characters: do not issue a search request and show `Type at least 3 characters`;
- three or more characters: query the active scope.

Clearing the search restores the active scope's browse list and its saved-only filter.

### 5.4 Pagination contract

Extend `GET /players/search` with:

- `limit`: integer from 1 to 50, default 10;
- `offset`: non-negative integer, default 0;
- `saved_ids`: optional comma-separated canonical player UUIDs, maximum 200.

Return:

```json
{
  "data": [],
  "total": 0,
  "has_more": false
}
```

Use offset pagination with deterministic ordering:

- blank query: recent match volume descending, wins descending, player name ascending, player ID ascending;
- named query: player name ascending, player ID ascending.

Apply league and saved-ID filters before counting and pagination.

The same pagination contract is mandatory for:

- the blank browse list;
- all text searches with three or more characters;
- Saved-only browsing;
- Saved plus text search;
- both `All leagues` and `Selected` scopes.

The client requests 10 results initially and automatically requests the next 10 when the user scrolls near the end. A search returning 11, 50, or hundreds of matches must remain scroll-loadable until `has_more` is false. Search results must never be capped at the current fixed limit of 20.

### 5.5 Empty states

Define distinct messages for:

- no recent players in the active league scope;
- no selected leagues;
- query shorter than three characters;
- no search matches;
- no saved players;
- no saved players matching the active scope/query.

## 6. State and data flow

For each screen:

1. The page owns active scope, query text, debounced query, and saved-only state.
2. A list-state hook receives the active scope plus filters.
3. The hook caches pages by a stable key derived from scope, normalized query, and saved-only state.
4. Changing scope renders that scope's cached list immediately when available and fetches only when missing or stale.
5. Changing query resets pagination for the active filter key after debounce.
6. Toggling Saved resets pagination for the active filter key.
7. Row favourite changes update local saved state immediately.
8. If Saved is active and a visible row is unsaved, remove it from the visible list without resetting the entire screen; reconcile with the query cache afterward.
9. Browse and search use the same infinite-query/list-state path so pagination cannot behave differently between empty-query and typed-query modes.

Search requests must be cancellable through the existing React Query/AbortSignal path so stale responses cannot replace newer results.

## 7. Accessibility and native behaviour

- Scope controls use correct segmented-control semantics and expose the selected value.
- Saved uses `aria-pressed` and does not rely on colour alone.
- Search inputs have accessible labels even when the visual UI uses placeholders.
- Loading and result-count changes are announced through a restrained `aria-live` region.
- Touch targets are at least 44x44px.
- Keyboard focus remains visible.
- Infinite loading also provides a reachable manual load/retry button through `InfiniteListFooter`.
- Returning from detail pages restores the originating scope, query, loaded pages, saved filter, and scroll position.

## 8. Error handling

Initial-load failure:

- show an error state in place of the list;
- retain the scope and toolbar;
- provide Retry.

Load-more failure:

- preserve existing items;
- stop automatic retries;
- show Retry in the footer.

Saved-filter request failure on Players:

- do not fall back to an unscoped local favourite list;
- explain that saved players could not be filtered for the active scope;
- provide Retry and allow Saved to be turned off.

## 9. Testing strategy

### 9.1 Design-system tests

- `SearchToolbar` renders an input and optional trailing actions;
- narrow-width layout remains usable at 320px;
- `AppToggleButton` exposes selected and accessible states;
- focus and disabled states remain visible.

### 9.2 Tournaments tests

- Upcoming loads first with page size 10;
- Completed is lazy-loaded;
- search requests target only the active tab;
- Saved intersects with lifecycle and query;
- switching tabs preserves query, pages, and scroll state;
- an unfiltered list with more than 10 matches scroll-loads further pages;
- a text search with more than 10 matches scroll-loads further pages;
- a Saved or Saved-plus-search result with more than 10 matches scroll-loads further pages;
- automatic load-more, retry, deduplication, and end state work;
- removing a favourite while Saved is active removes the row.

### 9.3 Players tests

- All leagues loads first with 10 browse results;
- Selected is queried only when active;
- empty selected-league state opens or points to league selection;
- one/two-character queries do not fetch;
- three-character queries reset and paginate correctly;
- a player search returning more than 10 matches loads additional pages on scroll;
- searches are not truncated at 20 results;
- Saved accurately intersects with active scope and query;
- Saved-only and Saved-plus-search results paginate when more than 10 match;
- player API validates and caps `saved_ids`;
- player API pagination ordering is stable;
- switching scope preserves query, pages, and scroll state;
- removing a favourite while Saved is active removes the row.

### 9.4 Regression checks

- root headers and bottom navigation remain unchanged;
- row navigation and favourite controls do not trigger each other;
- detail-page return restores list context;
- light and dark themes remain readable;
- existing tournament and player detail routes are unchanged.

## 10. Delivery scope

Implement Players and Tournaments together in one focused PR because they share the same new design-system toolbar and list-state conventions.

The PR includes:

- `SearchToolbar` and `AppToggleButton` in the shared design system;
- Tournament root-tab migration;
- Player root-tab migration;
- player-search pagination and saved-filter API changes;
- tests and mobile screenshot coverage.

Unrelated root tabs and detail-page redesigns are out of scope.
