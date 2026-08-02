# Player Insights Report Redesign

## Goal

Replace the current sparse player-insights list with a compact, useful player report that explains current form, rating progression, rival patterns, and career development without repeating the main player profile.

## Product principles

- The page is an interpretation layer, not another profile summary.
- Keep the existing rating-history chart as the primary analytical visual.
- Do not show doubles or home/away performance breakdowns because the available product data is not reliable enough for those comparisons.
- Use data already calculated by the insights endpoint wherever possible.
- Show enough context for every claim: opponent records include wins, losses, win rate, and encounter count.
- Keep the layout native-mobile and design-system compatible. Avoid the unrealistic three-column desktop dashboard treatment from the concept image.

## Page structure

### 1. Insights Summary

A compact 2-by-2 metric grid containing:

- Overall win rate
- Current form state
- Total singles matches
- Best season

A one-line generated takeaway sits below the metrics. It must describe recent form and career consistency without making unsupported coaching claims.

### 2. Rating & Form

Retain the current rating-history range controls, confidence band, selectable points, and selected-week detail.

Enhance the section with:

- Last eight result pills
- Current rating for the selected range
- Peak rating for the selected range
- Rating change from the first to latest point in the selected range

The existing chart remains the dominant element. Empty and error states continue to work independently of the rest of the insights page.

### 3. Rival Intelligence

Use a three-option segmented control rather than three narrow columns:

- Toughest
- Easiest
- Trending up

Each option shows up to four opponents in a tappable list. Toughest and easiest rows show win rate and W-L record. Trending rows show first-period win rate, recent-period win rate, improvement in percentage points, and total encounters.

Selecting an opponent opens the existing H2H flow for the current player and that opponent.

### 4. Career Story

Show four compact highlight cards in a 2-by-2 grid:

- Most active season
- Best month
- Longest win streak
- Completed match milestones

Below the highlights, show a dense season table with season, matches played, win-rate bar, wins, and losses. Rows are informational and must not show a chevron unless a real drill-down exists.

## API design

Add `GET /api/players/:id/rivals` rather than changing the established `/insights` response.

Response:

```ts
interface PlayerRivalsResponse {
  player_id: string;
  toughest: RivalRecord[];
  easiest: RivalRecord[];
  improving: ImprovingRivalRecord[];
}
```

The endpoint:

- resolves canonical player identities;
- aggregates canonical opponents across singles only;
- excludes deleted records and walkovers;
- requires at least three encounters for toughest/easiest ranking;
- requires at least four encounters for improvement ranking;
- returns at most four entries in each group;
- sorts deterministically with encounter count and opponent name as tie-breakers.

No database migration is required.

## Mobile architecture

- Add a typed `usePlayerRivalsQuery` hook.
- Add pure view-model helpers for summary copy, rival-tab data, milestone copy, and month formatting.
- Keep presentation in focused insight components rather than expanding `PlayerInsightsPage` into one large render function.
- Add a dedicated `player-insights.css` stylesheet using existing semantic CSS variables.

## Loading and failure behaviour

- Initial player stats and insights retain the full-page skeleton/error handling.
- Rival Intelligence has its own loading, error, and empty state so a rival failure does not hide rating or career data.
- Missing peak or milestone data renders a neutral dash and explanatory label rather than fabricated values.

## Accessibility

- Segmented rival controls expose pressed/selected state and a descriptive group label.
- Rival rows are real buttons or links with at least 44px tap height.
- Rating chart keyboard interaction remains available.
- Colour is never the sole indicator for win/loss or trend state.

## Verification

- Unit tests cover rival ranking and insight view-model formatting.
- Mobile build and design-system usage checks pass.
- API build and tests pass.
- A focused Playwright UI-review scenario checks summary, rating, rival switching, career layout, and narrow viewport overflow before capturing screenshots.
