# Player Following Hub Design

**Date:** 2026-08-02  
**Status:** Approved for implementation  
**Scope:** Mobile Players root tab and the root-header league action shown on that tab

This design supersedes the Players-screen interaction model in `2026-08-02-native-search-browse-pages-design.md`. The Tournaments design remains unchanged.

## 1. Intent

Turn the Players root tab into a focused personal player hub rather than a league-scoped player browser.

The page has two jobs:

1. give immediate access to the user's own profile and followed players;
2. find any player in the system through global search.

League selection must not affect this page. The page must use existing design-system components and must not introduce a bespoke hero, card system, or page-specific visual language.

## 2. Information architecture

The root header continues to show the page title `Players`, menu action, and feedback action.

The league-filter action is hidden while the Players tab is active because league selection does not affect the content or search results on this page.

The page body uses this order:

1. global player search field;
2. optional `My player` section when a player has been marked as the current user;
3. `Following` section when search is empty;
4. `Search results` section when a valid search is active.

Remove:

- the `All leagues` / `Selected` segmented control;
- the page-level `Saved` toggle;
- league-scoped empty states and league-selection actions.

## 3. Search behaviour

The search placeholder is `Search all players…`.

Search is always global and never includes `league_ids`.

Preserve the existing three-character performance guard:

- empty query: show the personal/default view;
- one or two non-whitespace characters: do not issue a player-search request and show a focused short-query state;
- three or more characters: show paginated global search results.

Clearing the query immediately restores the personal/default view.

Search results:

- initially load 10 players;
- automatically load further pages of 10 near the end of the list;
- preserve retry and end states through `InfiniteListFooter`;
- keep row-level favourite controls so users can follow or unfollow without leaving search.

## 4. My player section

When `useMyPlayer()` returns a player, show one compact design-system list row under a `My player` section heading.

The row contains:

- standard compact avatar using initials;
- player name;
- subtitle `Your player profile`;
- `You` pill as the trailing element;
- row navigation to the player profile.

Do not show the same player again in the Following section, even when that player is also saved.

When no current player has been selected, omit the section entirely rather than showing an empty placeholder.

## 5. Following section

Followed players come from `useFavouritePlayers()` and are refreshed through the existing paginated player-search API using `saved_ids` with no league filter. This keeps wins and played values current while retaining the user's local following membership.

The section:

- initially loads 10 followed players;
- supports progressive loading when more than 10 are followed;
- displays the number of locally followed players in section metadata;
- uses `DesignList`, `ListItem`, `DesignAvatar`, and `FavouriteButton`;
- removes an unfollowed row from the visible list immediately;
- opens the selected player's profile when the row is tapped.

When there are no followed players other than the optional current player, show:

- title: `No followed players yet`;
- message: `Search for any player above, then tap the heart to follow them here.`

A following-list request failure preserves the search field and optional My player section and provides Retry.

## 6. Search-result and state presentation

Use one `PageSection` for each visible content block and existing compact density.

Search states:

- short query: `Type at least 3 characters` / `Keep typing to search every player in the system.`;
- initial loading: `Loading players…`;
- no matches: `No players found` with the normalized query in explanatory copy;
- request failure: existing `ErrorState` with Retry;
- successful results: result count metadata and paginated list.

The page must not show a duplicated `Players` content heading below the root header. Section headings describe the content mode: `My player`, `Following`, or `Search results`.

## 7. Design-system constraints

Reuse only existing primitives:

- `SearchToolbar`;
- `AppSearchInput`;
- `PageSection`;
- `DesignList`;
- `ListItem`;
- `DesignAvatar`;
- `Pill`;
- `FavouriteButton`;
- `EmptyState`;
- `ErrorState`;
- `InfiniteListFooter`.

No new CSS is required. No page-specific visual primitive should be added.

Touch targets, focus states, theming, spacing, list dividers, and typography continue to come from the design system.

## 8. Accessibility

- Search has an explicit accessible label `Search all players`.
- My player and followed-player rows are keyboard/touch navigable through `ListItem`.
- Favourite controls retain their accessible saved/unsaved labels.
- The root-header league action is absent rather than disabled, preventing a control that has no effect.
- Loading, error, empty, and pagination states retain existing design-system semantics.

## 9. Testing

Add unit coverage for the player-tab view model:

- empty query selects following mode;
- one/two-character queries select short-query mode;
- three-character queries select global-search mode;
- the current player is excluded from followed IDs;
- other followed IDs retain their order.

Regression verification:

- mobile unit tests pass;
- mobile TypeScript/Vite build passes;
- design-system usage check passes;
- Players no longer receives league-scope props;
- RootHeader renders no league action on Players while other tabs keep it.

## 10. Out of scope

- new recommendation, popularity, recently viewed, or rating-discovery feeds;
- redesigning the player detail page;
- changing Home's `My TT` content;
- changing tournament browse behaviour;
- changing how a user selects or clears their current player.
