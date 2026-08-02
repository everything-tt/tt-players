# Player Insights Report Redesign

## Goal

Replace the current sparse player-insights list with a useful player report that explains current form, rating progression, rival patterns, and career development without repeating the main player profile.

The information architecture from the first redesign remains valid, but the visual treatment must now follow the established TT Players design system and the existing Player Profile page much more closely.

## Product principles

- The page is an interpretation layer, not another profile summary.
- Keep the existing rating-history chart as the primary analytical visual.
- Do not show doubles or home/away performance breakdowns because the available product data is not reliable enough for those comparisons.
- Show enough context for every claim: opponent records include wins, losses, win rate, and encounter count.
- Prefer established design-system components over page-specific visual components.
- Use one continuous page surface with flat sections and hairline separation.
- Do not create a dashboard of raised cards, nested cards, decorative tiles, or repeated rounded containers.
- Rounded geometry is reserved for established controls and tokens such as avatars, pills, segmented controls, and chart controls.

## Visual foundation

The page must use the same structural language as `PlayerPage`:

- `AppPageContent` as the page container;
- flat page sections matching the spacing and divider treatment of `tt-player-section` or the equivalent design-system `PageSection` flat variant;
- standard section headers with title, optional description, and compact metadata;
- `MetricGrid` for compact KPI summaries;
- `SegmentedToggle` for rival categories;
- `List` and `ListItem` for opponent and season rows;
- `Pill`, `Avatar`, `IconCircle`, and `OutcomeBadge` only where those established components add meaning.

No section should have its own shadow, elevated card shell, or large rounded border. Custom CSS should be limited to chart-specific layout, compact alignment, and responsive behaviour that cannot be expressed through design-system components.

## Page structure

### 1. Insights Summary

Render a flat section titled **Insights Summary**.

Use one compact four-column `MetricGrid` containing:

- Overall win rate
- Current form state
- Total singles matches
- Best season

On narrow screens, the canonical responsive behaviour of `MetricGrid` may reduce the columns. The metrics must not be individual cards.

A single muted takeaway line sits below the grid. It describes recent form and career consistency without making unsupported coaching claims. It must not use a separate callout card.

### 2. Rating & Form

Render a flat section titled **Rating & Form**.

Retain the current rating-history range controls, confidence band, selectable points, selected-week detail, and chart behaviour.

Add the following context without placing each item in a box:

- Last eight result pills
- Current rating for the selected range
- Peak rating for the selected range
- Rating change from the first to latest point in the selected range

Use a compact `MetricGrid` or equivalent canonical metric row for current rating, peak rating, and selected-range change. The rating chart remains the dominant element.

The chart may retain a subtle internal plotting surface where technically required, but the entire Rating & Form section must not be wrapped in another raised card.

### 3. Rival Intelligence

Render a flat section titled **Rival Intelligence** with a short description explaining that the rankings use recorded singles meetings.

Use the design-system `SegmentedToggle` with three options:

- Toughest
- Easiest
- Trending up

Render the selected category directly as a standard compact `List`; do not add an inner rival panel.

Each category contains up to four opponents. Rows use `ListItem` and contain:

- a standard avatar or rank indicator;
- opponent name;
- meeting count and W-L record in the subtitle;
- win rate or improvement delta in the trailing area;
- a standard chevron because tapping opens the existing H2H flow.

Toughest and easiest rows show win rate, W-L record, and encounter count. Trending rows show first-period win rate, recent-period win rate, improvement in percentage points, and encounter count.

### 4. Career Story

Render a flat section titled **Career Story**.

Use one compact four-item `MetricGrid` for:

- Most active season
- Best month
- Longest win streak
- Latest completed match milestone

Do not render these as coloured highlight cards. Semantic colour should only communicate actual state, not decorate categories.

Below the metric row, render seasons as standard informational list rows. Each row contains:

- year as the title;
- matches played, win rate, wins, and losses in the subtitle;
- an optional small `Pill` for the best season;
- no chevron unless a real season drill-down is added later.

Do not use a custom bordered table card or decorative progress bars for season volume.

## API design

Keep `GET /api/players/:id/rivals`; the richer rival data is still required by the approved information design.

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

- Keep the typed `usePlayerRivalsQuery` hook.
- Keep pure view-model helpers for summary copy, rival-tab data, milestone copy, and month formatting.
- Keep presentation split into focused components, but each component should compose design-system primitives instead of defining a standalone card system.
- Remove or substantially reduce the dedicated `player-insights.css` geometry introduced by the first implementation.
- Reuse existing Player Profile section classes only when they are the canonical app pattern; otherwise use exported design-system layout components.
- Avoid adding new generic design-system components unless an existing primitive cannot express the approved layout.

## Loading and failure behaviour

- Initial player stats and insights retain full-page skeleton and error handling.
- Skeletons should resemble flat sections and standard metric/list placeholders, not raised cards.
- Rival Intelligence retains its own loading, error, and empty state so a rival failure does not hide rating or career data.
- Missing peak or milestone data renders a neutral dash and explanatory label rather than fabricated values.

## Accessibility

- Segmented rival controls use the design-system radio semantics and keyboard navigation.
- Rival rows are real buttons or links with at least 44px tap height.
- Rating chart keyboard interaction remains available.
- Colour is never the sole indicator for win/loss or trend state.
- Informational career rows do not present misleading interactive affordances.

## Verification

- Unit tests continue to cover rival ranking and insight view-model formatting.
- Mobile build and design-system usage checks pass.
- API build and tests pass.
- A focused Playwright UI-review scenario checks:
  - flat section structure without nested section cards;
  - summary and rating metrics;
  - rival category switching and navigation affordances;
  - career rows and best-season treatment;
  - absence of horizontal overflow at 390px and 360px widths.
- Updated PR screenshots must cover the summary/rating, rival intelligence, and career sections so the design-system alignment can be reviewed visually.
