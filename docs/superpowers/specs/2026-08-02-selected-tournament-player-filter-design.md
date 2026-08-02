# Selected Tournament Player Filter Design

## Goal

When a tournament player is selected, make the page clearly enter a player-filtered state instead of continuing to show every player.

## Approved interaction

- Selecting a player filters the Results section to matches involving that player.
- While a player is selected, the Players section hides the search input, the All/Undefeated controls, and the normal player list.
- The Players section shows one compact active-filter row containing the selected player's name and a clear action.
- The selected player is not repeated as a normal player result row.
- Clearing the player restores the search input, player filters, and complete player list.
- Selecting a player from Most wins or a result row enters the same selected state.
- The recorded-stage filter remains independent and continues to compose with the selected-player filter.

## Approaches considered

1. **Keep the full list and merely highlight the selected player.** Rejected because unrelated players remain visible and the filter state is easy to miss.
2. **Show only the selected player as a normal list row.** Better, but duplicates the purpose of the active-filter control and still looks like a selectable search result.
3. **Use a compact selected-filter state and hide the browsing controls.** Chosen because it makes the mode change explicit, removes irrelevant content, and gives one obvious way to clear the filter.

## Component and state changes

The existing `selectedPlayer` state remains the source of truth.

`filteredTournamentPlayers` continues to handle search and undefeated filtering only when no player is selected. The render path branches on `selectedPlayer`:

- selected: render the compact active-filter state;
- not selected: render search, All/Undefeated controls, empty state, and paginated player list.

No API or data-model changes are required.

## Accessibility

- The clear action remains a real button with an explicit `Clear player` label.
- The selected state exposes the player's name in visible text.
- Existing `aria-pressed` behavior for All/Undefeated remains unchanged when browsing players.

## Tests

Add a focused mobile contract test covering:

- browsing controls and multiple players are present before selection;
- selecting a player hides the search, All/Undefeated controls, and unrelated player rows;
- the selected-player filter label and clear action are present;
- clearing restores the browsing controls and player list;
- result filtering still composes with the round filter.

## Out of scope

- Changing tournament result ordering.
- Changing favourite-player behavior.
- Changing the Most wins section.
- Changing recorded-stage filtering.
- Adding URL-persisted filter state.
