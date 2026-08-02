# MatchRecordRow Design

## Goal

Create one design-system component for compact completed-match records so player matches, team fixtures, H2H meetings, and tournament results share the same score-led hierarchy, spacing, actions, accessibility, and responsive behaviour.

The component replaces page-specific compact score/result rows. It does not own table-tennis domain logic, routing, data fetching, pagination, filtering, or journal rules.

## App-wide review and scope

Use `MatchRecordRow` when the UI represents one completed result as a compact list row.

### Migrate

1. Player profile — Recent Matches.
2. Player full match history.
3. Home — Latest results.
4. Leagues — Across your leagues.
5. Team page — completed rows in Matches.
6. H2H — Meeting history.
7. Tournament detail — recorded Results.

### Keep existing specialist presentations

- Fixture detail rubber scorecards: these are two-sided detailed layouts and may include doubles pairs.
- Fixture detail aggregate hero score: this is a summary metric, not a compact record row.
- Upcoming or postponed fixtures: these are schedule records, not completed results.
- Standings, form strips, rankings, player summaries, and tournament summary cards.

This boundary prevents the component from becoming a universal sports-row abstraction.

## Component API

```tsx
<MatchRecordRow
  score={{ value: '3–1', outcome: 'win', ariaLabel: 'Won 3 games to 1' }}
  title="Lucy Elliott"
  metadata={['County Championships Junior', '11 Apr 2026']}
  onClick={openOpponent}
  actions={[
    { iconClassName: 'fa fa-pen', label: 'Quick Journal', onClick: openJournal, tone: 'accent' },
    { iconClassName: 'fa fa-calendar', label: 'View fixture', onClick: openFixture },
  ]}
/>
```

```tsx
<MatchRecordRow
  score={{ value: '9–1', outcome: 'neutral', ariaLabel: 'Essex 9, Sussex 1' }}
  title="Essex vs Sussex"
  metadata={['County Championships · U13 Pilot Competition — Division One', '19 Jul 2026']}
  onClick={openFixture}
/>
```

### Props

- `score.value`: short visible value such as `3–1`, `W`, `L`, `D`, or `—`.
- `score.outcome`: `win`, `loss`, or `neutral`; controls semantic tone only.
- `score.ariaLabel`: complete spoken description.
- `title`: primary label as text or a React node.
- `metadata`: one or two ordered text or React-node values. The component owns separators and wrapping.
- `onClick`: optional primary row action.
- `actions`: zero to two direct secondary actions.
- `density`: `compact` by default, with `standard` available for future use.
- `className`: optional extension hook.

## Score behaviour

The score tile has a stable width and height, rounded background, centred typography, and design-token colours based on the current league score tile.

Consumers order the score for their context:

- Player lists: viewed player first.
- Team page: viewed team first, regardless of home or away.
- Home and league dashboards: home team first.
- H2H meeting history: Player A first.
- Tournament result filtering: selected player first; otherwise winner first.

Supported values:

- detailed win: `3–1`
- detailed loss: `1–3`
- outcome-only win: `W`
- outcome-only loss: `L`
- draw: detailed score or `D`
- genuinely unknown result: `—`

The component never parses result strings. Application helpers produce the score model.

For player and H2H records, the existing separate `WON` / `LOST` or W/L badge is removed because it duplicates the score tile.

## Tournament data

Tournament results currently expose winner identity but not game scores. The API already reads canonical rubber rows, so the event result contract will add nullable `home_games_won` and `away_games_won` fields.

- When both values are available, tournament rows show the detailed score.
- When scores are unavailable but the winner is known, rows show `W` or `L`.
- Existing data remains valid because the new fields are nullable.

## Visual hierarchy

The row layout is:

1. fixed score tile
2. flexible title and metadata content
3. zero, one, or two direct action buttons

The title remains the strongest text. Metadata is muted and may wrap. The score is prominent but does not exceed the title weight.

On narrow screens:

- score width remains stable
- action buttons retain accessible touch targets
- title truncates only when necessary
- metadata wraps before actions are compressed
- no overflow drawer is introduced

## Interaction model

### Individual match on another player's profile

- tapping the main row opens the opponent profile
- one direct fixture/event button opens the source record

### Individual match on the identified player's profile

- tapping the main row opens the opponent profile
- Quick Journal is a direct secondary action
- fixture/event is a direct secondary action

### Team fixture lists

- tapping the row opens the fixture
- team-page completed rows show the score from the viewed team's perspective
- upcoming and postponed rows retain their schedule presentation

### H2H history

- tapping the row opens the fixture
- score and outcome are from Player A's perspective

### Tournament results

- tapping a row keeps the existing player-filter behaviour
- the score orientation follows the selected player when one is active; otherwise it follows the winner-first presentation

Secondary action clicks must not trigger the row action.

## Accessibility

- Interactive rows use existing design-system list-item semantics.
- Score tiles include a complete `aria-label`; colour is not the only outcome signal.
- Action buttons have explicit labels such as `Journal match against Lucy Elliott` and `View fixture for match against Lucy Elliott`.
- Touch targets remain at least the existing design-system action-button size.
- Keyboard focus order is row first, then direct actions.

## Design-system boundaries

`MatchRecordRow` owns presentation and interaction structure only. It depends on existing design-system primitives such as `ListItem` and `AppButton`.

Application code owns:

- parsing and ordering scores
- deciding `win`, `loss`, or `neutral`
- route selection and row actions
- journal availability
- fixture versus event labels
- loading, errors, filtering, pagination, and section headers

## Migration plan

1. Add `MatchRecordRow` and styles to the design system and export it through the app kit.
2. Add shared app helpers that parse player result text and construct team, H2H, and tournament score models.
3. Replace player Recent Matches and full history rows.
4. Replace Home and Leagues completed fixture rows.
5. Replace completed Team page rows while preserving upcoming/postponed rows.
6. Replace H2H Meeting history rows.
7. Extend tournament API/types with nullable game scores and replace tournament Results rows.
8. Remove duplicate compact score-badge CSS only after all consumers migrate.
9. Add design-system examples and focused mobile UI review coverage.

## Error and edge cases

- Missing opponent ID: render a non-clickable main row while retaining source actions.
- Missing source label: use the consumer's existing league, event, round, or status fallback.
- Long competition names: metadata wraps; action buttons remain visible.
- Malformed player result string: render `W` or `L` when outcome is known, otherwise `—` neutrally.
- Missing team score: keep schedule/status treatment instead of pretending a completed score exists.
- Drawn team fixtures: use neutral tone and the recorded score.
- Missing tournament score: use winner-derived `W` or `L`.

## Testing

### Design-system tests

- detailed score, outcome-only, draw, and unknown rendering
- win/loss/neutral tone classes
- zero, one, and two action layouts
- primary-row and secondary-action event separation
- accessible score and action labels
- compact responsive markup contract

### Application tests

- player result parser returns `3–1`, `W`, `L`, and `—`
- viewed player/team/H2H score is ordered first
- journal action appears only for the identified player
- fixture/event action remains available
- Home and Leagues use the shared component
- Team page migrates completed rows but not upcoming/postponed rows
- H2H history no longer uses a separate outcome badge
- tournament API maps nullable game scores and UI falls back to W/L
- Fixture detail rubber scorecards remain unchanged

### UI review

The focused mobile Playwright scenario captures:

- identified-player row with two direct actions
- another-player row with one direct action
- scoreless W/L fallback
- Home or Leagues team result row
- Team page completed fixture row
- H2H meeting row
- tournament result row
- narrow-screen metadata wrapping

## Acceptance criteria

- All in-scope compact completed-result lists use `MatchRecordRow`.
- Detailed player scores appear in a leading score tile.
- Scoreless individual records show `W` or `L` without restoring a result pill.
- Unknown results show `—` neutrally.
- Team score ordering matches the page context.
- Tournament rows use detailed scores when available and W/L otherwise.
- Existing direct row/action behaviour approved in PR #88 remains unchanged.
- Existing infinite scrolling, filters, navigation, hero content, detailed rubber scorecards, and journal prefill continue to work.
