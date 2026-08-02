# Player Match List and Identity Interaction Design

**Date:** 2026-08-02  
**Status:** Approved design, pending implementation plan  
**Repository:** `wudong/tt-players`

## Objective

Improve the recent-match experience on the player profile while preserving the existing player hero and all other profile sections. Clarify the distinction between a followed player and the single player profile identified as the current user.

## Scope

This change covers:

1. Identity and following behaviour on Home and the player profile.
2. The recent-match section on `PlayerPage`.
3. Infinite scrolling for matches shown on the profile.
4. Direct navigation to the opponent profile.
5. A quick journal action for the profile identified as the current user.

The player hero, rating panel, clubs/tournaments section, form section, profile header, and general page layout remain unchanged.

## Identity and Following Behaviour

### Single identity

Only one player may be identified as the current user.

Before an identity is selected, followed players on Home may show **This is me**. Once a player is selected:

- all remaining **This is me** actions disappear;
- the selected player appears in the main **My TT** summary;
- the selected player is excluded from the **Following** list;
- other saved players remain followed independently.

Changing identity replaces the previous identity rather than creating multiple identities.

### Following

Following and identity are separate concepts.

- Followed-player rows expose **Unfollow**.
- Selecting **This is me** does not implicitly unfollow other players.
- Clearing the identity does not automatically unfollow that player.

### Clearing identity

When viewing the profile currently identified as the user, expose a **This isn’t me** action. This action calls the existing `useMyPlayer().clear()` behaviour.

The action belongs on the player profile, not on Home. It should be visually secondary and must not alter the existing hero layout beyond adding the supported profile action.

## Recent Match Section

### Placement and preservation

Replace only the current **Last 10 Matches** section on `PlayerPage`. Do not redesign or reorder other profile sections.

Rename the section to **Recent Matches** because it will no longer be limited to ten records.

### Initial load and infinite scrolling

- Load the newest 20 matches initially.
- Load older matches in pages of 20.
- Use the design-system `InfiniteListFooter` as the scroll sentinel and accessible manual fallback.
- Preserve already loaded rows while fetching the next page.
- Deduplicate appended records by match ID.
- Show an end-of-history state when all matches are loaded.
- On a later-page failure, retain existing rows and show a retry action.

The separate `PlayerMatchesPage` route may remain available. Shared pagination and rendering logic should be extracted where practical so the profile and full-history page do not drift.

## Compact Match Row

Use the compact design-system list treatment rather than large filled win/loss circles.

Each row contains:

- a neutral compact date block;
- opponent name as the primary label;
- result, such as **Won 3–1** or **Lost 0–3**;
- competition/source and division as supporting metadata;
- a visible opponent-profile icon when `opponent_id` is available;
- a three-dot overflow action.

### Outcome styling

- Wins use restrained success text or a subtle success badge.
- Losses use restrained danger text or a subtle danger badge.
- Do not use large solid green or red leading circles.
- Date, source, and division remain neutral.
- All colours and spacing must use existing design-system tokens and components.

### Main row action

Tapping the main row preserves current navigation:

- league match → fixture page;
- tournament match with an event ID → tournament event page.

Nested actions must stop propagation so they do not also trigger the main row action.

## Match Actions

### Visible opponent action

When `opponent_id` is present, a visible player icon opens `player/{opponent_id}` in the active Players tab.

When `opponent_id` is absent, omit or disable the action rather than attempting name-based navigation.

### Overflow menu

The row overflow menu provides explicit labelled actions:

1. **View Opponent** — shown only when `opponent_id` exists.
2. **Quick Journal** — shown only when the viewed profile is the current user’s identified player.
3. **View Fixture** or **View Event** — label and destination depend on match source.

Repeating **View Opponent** in the menu is intentional: the visible icon supports fast use, while the labelled menu item improves discoverability and accessibility.

## Quick Journal

### Availability

Quick Journal is available only when:

- a current-user identity exists; and
- the viewed player ID matches that identity.

It must not appear on another player’s profile, even when that player is followed.

### Flow

Quick Journal reuses the existing journal page rather than introducing a second form.

Navigate to the existing journal route with prefill data encoded in route state or query parameters:

- match date;
- opponent name;
- result mapped to `win` or `loss`;
- optional match ID and source reference for future traceability.

`MatchJournalPage` reads and validates these values, pre-populates the current fields, and leaves the remaining reflection fields for the user to complete.

Opening Quick Journal must not save an entry automatically.

## Components and Boundaries

Prefer these implementation boundaries:

### `usePagedPlayerMatches`

Owns server pagination state:

- loaded matches;
- offset and total;
- initial loading;
- loading more;
- retry behaviour;
- deduplication;
- reset when player or source filter changes.

### `PlayerMatchList`

Owns presentation and match actions:

- compact design-system rows;
- outcome treatment;
- opponent action;
- overflow menu;
- main fixture/event navigation;
- infinite-list footer.

It receives whether Quick Journal is enabled instead of reading identity state internally.

### Profile integration

`PlayerPage` determines whether the viewed player is the current user via `useMyPlayer`, passes that capability to `PlayerMatchList`, and otherwise leaves the existing profile structure untouched.

### Full-history integration

`PlayerMatchesPage` may consume the same paged hook and list component while retaining its existing source filter.

## Error and Empty States

- Initial failure: use the existing design-system error state with retry.
- Empty profile history: show the existing empty-state treatment.
- Load-more failure: keep loaded matches visible and show retry near the list footer.
- Missing opponent ID: hide opponent navigation only; the row and fixture navigation remain usable.
- Invalid journal prefill: ignore invalid values and fall back to the current journal defaults.

## Accessibility

- Every icon-only action requires an explicit `aria-label` including the opponent where relevant.
- Overflow items are text labelled.
- Keyboard activation must work for the main row and nested actions.
- Nested controls must not be placed inside another interactive element; the match row component must support separate action regions without invalid button nesting.
- Loading and end states use `aria-live` through the existing infinite-list component.

## Testing

### Identity tests

- Only one identity can be active.
- Other **This is me** actions disappear after selection.
- Identity player is excluded from Following.
- Unfollow does not clear identity.
- **This isn’t me** clears identity without changing follow state.

### Match-list tests

- Newest 20 rows load first.
- Scrolling loads the next page once.
- Appended rows are deduplicated.
- Main row opens the correct fixture or event destination.
- Opponent action opens the opponent profile when an ID exists.
- Opponent action is absent when the ID is null.
- Nested actions do not trigger row navigation.
- Quick Journal appears only on the identified user’s profile.
- Quick Journal pre-populates date, opponent, and result without auto-saving.
- Load-more failure preserves existing rows and supports retry.

### Visual checks

- Existing hero and non-match sections are unchanged.
- Compact rows remain readable at narrow mobile widths.
- No large solid green win indicator remains.
- Win/loss status meets design-system contrast requirements.
- Infinite-scroll loading and end states do not overlap the bottom navigation.

## Out of Scope

- Redesigning the player hero or other profile sections.
- Changing match, fixture, or tournament data semantics.
- Name-based opponent matching when `opponent_id` is missing.
- Automatically generating journal analysis.
- Syncing journal entries to a server.
- Replacing the existing full journal form with a modal or bottom sheet.
