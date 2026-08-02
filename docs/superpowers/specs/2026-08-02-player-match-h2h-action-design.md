# Player Match H2H Action

## Goal

Make the three most useful destinations from a player match row direct and discoverable without relying on an overflow menu.

## Chosen interaction

- Tapping the match row opens the source match: the league fixture or tournament event.
- Tapping the opponent name opens that opponent’s player profile.
- A visible trailing H2H icon opens the comparison between the profile player and that opponent.
- On the current user’s player profile, Quick Journal remains available as the other trailing action.

## Action layout

- Another player’s match row shows one trailing H2H action.
- The current user’s match row shows Quick Journal followed by H2H, preserving H2H in the rightmost position previously occupied by the fixture/event action.
- The calendar fixture/event action is removed because the row itself now performs that navigation.
- Match rows continue to expose at most two trailing actions.

## Missing-opponent behaviour

When `opponent_id` is unavailable:

- The opponent name is plain text rather than a profile action.
- The H2H action is omitted.
- The row still opens the source fixture or tournament event.
- Quick Journal remains available when the profile belongs to the current user.

## Navigation

- The H2H action switches to the H2H tab and opens `h2h/{playerId}/{opponentId}`.
- Add the missing tab-scoped route `/tabs/:tabId/h2h/:playerAId/:playerBId` so the comparison page participates in the existing tab navigation stack.
- The comparison order is the profile player first and the opponent second.

## Accessible interaction model

The row, opponent name, H2H action, and Quick Journal action must remain separate keyboard-focusable controls. Do not nest buttons or links.

Extend the shared list/match-row primitives with a split-action layout:

- A stretched primary row action covers the non-interactive row surface and has an explicit accessible label.
- The opponent title action and trailing actions sit above the stretched action as independent controls.
- Focus styling makes the active destination clear.

## Visual treatment

- Use the existing compact match-row geometry and trailing action button size.
- Use `fa-people-arrows` for H2H, matching existing H2H visual language.
- Keep Quick Journal as the accent action and H2H as the neutral outlined action.
- Do not introduce overflow, swipe actions, a bottom sheet, or an inline text chip.

## Testing

Cover the following contracts:

- The row action is labelled as opening the fixture/event and no calendar action remains.
- The opponent title has its own profile action when `opponent_id` exists.
- H2H is visible and targets the profile player/opponent pair.
- Missing opponent ids suppress profile and H2H actions while preserving row navigation.
- Current-user rows contain exactly Quick Journal and H2H trailing actions.
- The tab-scoped direct H2H route renders the comparison page.
- Playwright verifies row, opponent name, H2H, and Quick Journal navigate independently and the mobile row remains uncluttered.