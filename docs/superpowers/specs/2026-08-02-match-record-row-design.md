# MatchRecordRow Design

## Goal

Create one design-system component for compact completed-match records so individual player matches and team fixtures share the same visual hierarchy, spacing, score treatment, actions, accessibility, and responsive behaviour.

The component replaces page-specific score/date layouts. It does not own table-tennis domain logic, routing, data fetching, pagination, or journal rules.

## Scope

The first version supports both existing completed-result use cases:

1. **Individual match** — an opponent name, the viewed player's result, competition/date metadata, and optional direct actions.
2. **Team fixture** — two team names, the fixture score, competition/date metadata, and an optional primary navigation action.

Upcoming fixtures and live scoring are out of scope.

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

- `score.value`: short visible value such as `3–1`, `W`, `L`, or `—`.
- `score.outcome`: `win`, `loss`, or `neutral`; controls semantic tone only.
- `score.ariaLabel`: complete spoken description.
- `title`: primary label. The consumer decides whether this is an opponent or two teams.
- `metadata`: one or two ordered metadata strings. The component handles separators and wrapping.
- `onClick`: optional primary row action.
- `actions`: zero to two direct secondary actions.
- `density`: `compact` by default, with `standard` available for future use.
- `className`: optional extension hook.

The component accepts rendered React nodes for `title` and metadata values where needed, but the default use should remain plain text.

## Score behaviour

The score tile has a stable width and height, rounded background, centred typography, and design-token colours matching the current league result tile.

For individual matches, the consumer always presents the viewed player's games first:

- detailed win: `3–1`
- detailed loss: `1–3`
- outcome-only win: `W`
- outcome-only loss: `L`
- genuinely unknown result: `—`

The tile never parses domain strings itself. A player-match helper converts API values such as `Won 3-1`, `Lost 1-3`, `Won`, or `Lost` into the design-system score model.

The existing separate `WON` / `LOST` pill is removed because it duplicates the score tile.

## Visual hierarchy

The row layout is:

1. fixed score tile
2. flexible title and metadata content
3. zero, one, or two direct action buttons

The title remains the strongest text. Metadata is muted and may wrap to two lines. The score is prominent but does not exceed the title weight.

On narrow screens:

- score width remains stable
- actions keep accessible touch targets
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

### Team fixture

- tapping the row opens the fixture
- no duplicate fixture action is required unless a consuming page needs another primary target

Secondary action clicks must not trigger the row action.

## Accessibility

- Interactive rows use the existing design-system list-item navigation semantics.
- Score tiles include a complete `aria-label`; visual text alone is not relied on.
- Outcome is conveyed by text and accessible labels, not colour alone.
- Action buttons have explicit labels such as `Journal match against Lucy Elliott` and `View fixture for match against Lucy Elliott`.
- Touch targets remain at least the existing design-system action-button size.
- Keyboard focus order is row first, then direct actions.

## Design-system boundaries

`MatchRecordRow` owns presentation and interaction structure only. It depends on existing design-system primitives such as `ListItem` and `AppButton`.

Application code owns:

- parsing and ordering scores
- deciding `win`, `loss`, or `neutral`
- route selection
- journal availability
- fixture versus tournament labels
- loading, errors, pagination, and section headers

This keeps the component reusable without embedding TT Players business rules.

## Migration

1. Add `MatchRecordRow` and its styles to the design system.
2. Add score parsing for player rubber records, including scoreless `W` / `L` fallbacks.
3. Replace the current player match row in both Recent Matches and full match history.
4. Replace the league completed-fixture row with `MatchRecordRow` while preserving its current text, score, and navigation behaviour.
5. Remove duplicate page-specific score tile CSS after both consumers use the shared component.

## Error and edge cases

- Missing opponent ID: render a non-clickable main row while retaining fixture/event actions.
- Missing source label: use the existing league or event fallback supplied by the consumer.
- Long competition names: metadata wraps; action buttons remain visible.
- Malformed result string: render `W` or `L` when outcome is known, otherwise `—` with neutral tone.
- Drawn team fixtures: use neutral tone and the recorded score.

## Testing

### Design-system tests

- detailed score, outcome-only, and unknown score rendering
- win/loss/neutral tone classes
- zero, one, and two action layouts
- primary-row and secondary-action event separation
- accessible score and action labels
- compact responsive markup contract

### Application tests

- player result parser returns `3–1`, `W`, `L`, and `—` correctly
- viewed player's score is always first
- journal action appears only for the identified player
- fixture/event action remains available
- team fixtures retain their existing visible score and navigation

### UI review

The focused mobile Playwright scenario captures:

- identified-player row with two direct actions
- another-player row with one direct action
- scoreless `W` or `L` fallback
- team fixture row using the same component
- narrow-screen metadata wrapping

## Acceptance criteria

- Player and league result lists use the same design-system `MatchRecordRow`.
- Detailed player scores appear in a leading score tile.
- Scoreless player records show `W` or `L` without restoring the result pill.
- Unknown results show `—` neutrally.
- The direct row/action behaviour approved in PR #88 remains unchanged.
- Existing infinite scrolling, hero content, sections, fixture navigation, and journal prefill continue to work.
