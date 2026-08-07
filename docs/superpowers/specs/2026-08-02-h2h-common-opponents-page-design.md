# H2H Common Opponents Page Design

## Goal

Make the common-opponent evidence in the H2H view understandable and fully explorable. The H2H page should show a concise preview, while a dedicated page should allow users to inspect every shared opponent and change the ordering.

## Current Problem

The analysis endpoint calculates the total number of shared opponents before applying its row limit, so the UI can show a badge such as `70 shared` while only exposing ten rows. The mobile list then paginates only those ten rows and displays an `All 10 shown` footer. This makes the total look inconsistent and prevents users from reaching the remaining opponents.

## Approved UX

### H2H preview

- Keep the `Common opponents` section on the H2H page.
- Show only the top five common opponents.
- Rank this preview by **Most evidence**: combined matches played by both compared players against that opponent, descending.
- Remove the `All 10 shown` footer and any preview pagination control.
- Make the section header and the shared-count pill actionable.
- Tapping either opens the dedicated common-opponents page.
- Preserve the current empty state when no shared opponents exist.

### Dedicated page

The page title is `Common opponents` and includes the two compared player names as context.

The page shows all shared opponents through incremental scroll-to-load pagination. Each row contains:

- opponent identity;
- each compared player’s wins, losses, matches played, and win rate;
- the win-rate edge;
- the latest date either compared player faced that opponent.

Selecting an opponent opens that opponent’s player profile.

### Sorting

Use a design-system-compatible native sort control with these options:

1. **Most evidence** — descending combined match count. This is the default.
2. **Most recent** — descending latest match date where either compared player faced the opponent.
3. **Largest edge** — descending absolute win-rate difference; use combined matches and opponent name as deterministic tie-breakers.
4. **Closest record** — ascending absolute win-rate difference; use combined matches descending and opponent name as deterministic tie-breakers.

Changing the sort resets pagination and scroll position to the top.

## API Design

Add a dedicated endpoint rather than increasing the existing analysis limit:

`GET /players/:playerId1/h2h/:playerId2/common-opponents`

Query parameters:

- `sort`: `evidence | recent | edge | closest`, default `evidence`;
- `limit`: integer, default 20, maximum 50;
- cursor fields appropriate to the active sort.

Response:

```ts
{
  players: {
    player1: { id: string; name: string };
    player2: { id: string; name: string };
  };
  total: number;
  data: Array<{
    opponent_id: string;
    opponent_name: string;
    latest_played_at: string | null;
    combined_played: number;
    player1: {
      played: number;
      wins: number;
      losses: number;
      win_rate: number;
    };
    player2: {
      played: number;
      wins: number;
      losses: number;
      win_rate: number;
    };
    edge: number;
  }>;
  next_cursor: string | null;
}
```

Use cursor pagination so newly added match data does not create unstable offset behaviour. The cursor must include all active ordering columns plus opponent ID as the final unique tie-breaker.

The endpoint must:

- resolve canonical player identities in the same way as the existing H2H analysis endpoint;
- exclude doubles, deleted records, deleted fixtures, walkovers, and the two compared players themselves;
- include all canonical aliases for both compared players and opponents;
- calculate `latest_played_at` from the latest qualifying match involving either compared player and the common opponent;
- use deterministic ordering for every sort mode.

## Existing Analysis Endpoint

Keep the existing H2H analysis endpoint for verdict and evidence summary calculations. Change its preview limit to five when called by the mobile H2H page. The summary total and aggregate calculations must continue to use the complete common-opponent set rather than only the five preview rows.

Do not raise the current hard limit as a substitute for the dedicated endpoint.

## Mobile Architecture

Add a `CommonOpponentsPage` routed within the H2H tab navigation. The route carries both player IDs. Player names may be supplied optimistically from the H2H screen, but the page must use the API response as the authoritative identity.

Add an infinite query hook keyed by:

```ts
['players', 'h2h', playerId1, playerId2, 'common-opponents', sort]
```

The H2H preview remains part of `RatingPredictionPanel`, but it becomes a fixed five-row list without list pagination. Its header and count pill invoke the same navigation callback.

## Loading and Error States

- Initial page load: design-system loading state.
- Additional page load: inline bottom loading indicator.
- Initial failure: full-page error state with retry.
- Later-page failure: retain loaded rows and show an inline retry action.
- Empty result: explain that both players must have faced at least one of the same opponents.
- End of results: stop requesting additional pages; do not show an `All N shown` footer.

## Accessibility

- The actionable preview header must be a real button or link with an accessible name such as `View all 70 common opponents`.
- The sort control needs a visible label.
- Announce sort changes and appended result counts through an appropriate live region.
- Preserve keyboard navigation and visible focus states from the design system.

## Caching

Use React Query’s standard cache. Cache entries are separated by player pair and sort mode. The API may reuse the existing H2H source-version strategy or an equivalent data-version mechanism so cached pages invalidate when relevant rubbers, fixtures, or player identities change.

## Testing

### API

- Returns all shared opponents across multiple pages.
- Canonicalizes duplicate player identities correctly.
- Excludes doubles, walkovers, deleted rubbers, and deleted fixtures.
- Calculates `latest_played_at` from either compared player’s latest match.
- Produces deterministic results for all four sort modes.
- Cursor pagination has no duplicates or missing rows across page boundaries.
- Reverse player order correctly reverses player data and edge signs without changing opponent order semantics.

### Mobile

- H2H preview renders at most five rows.
- `All 10 shown` is absent.
- Header and shared-count pill navigate to the dedicated page.
- Default sort is `Most evidence`.
- Changing sort resets loaded pages.
- Scrolling loads additional pages until all results are available.
- Row selection opens the opponent profile.
- Initial and incremental errors render the correct recovery controls.

## Out of Scope

- Filtering by competition, season, or date range.
- Searching common opponents by name.
- Changing the model prediction to use only the currently selected common-opponent sort.
- Reworking the overall H2H evidence layout beyond this section.