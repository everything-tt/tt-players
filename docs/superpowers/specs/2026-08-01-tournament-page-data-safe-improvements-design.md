# Tournament Detail Design-System Migration

## Goal

Rebuild the tournament detail page with the shared mobile design system and expose only tournament conclusions that can be validated from imported match records.

## Data boundary

The event-detail response provides tournament metadata and match records with player identities, winner side, source round name/order, and optional played time. The UI may derive player records, source stage counts, and a limited knockout result.

The page must not infer England ratings, rating changes, seeds, group positions, complete standings, or arbitrary bracket placement.

## Page composition

Use the canonical shared components throughout:

- `EntityHero` for tournament identity, source actions, and headline metrics
- `MetricGrid` for recorded players, matches, stages, and undefeated players
- `PageSection` for knockout result, most wins, players, and results
- `FilterBar` and `AppButton` for narrow-screen filters
- `DesignList` and `DesignAvatar` for compact player and result rows
- `Stack` and `Inline` for page rhythm and alignment
- `EmptyState` for filtered and missing-result states

Do not introduce page-specific gutters, card geometry, list row heights, control sizes, or section spacing.

## Knockout result

A knockout result may be shown only when exactly one source stage normalises to `final` and the match has a valid winner side.

- Winner: winner of that recorded final
- Runner-up: loser of that recorded final
- Semi-finalists: losers of exactly two recorded semi-finals, only when both semi-final winners are exactly the two final participants and no third-place match is recorded

Call the section `Knockout result`, not `Final standings`. If validation fails, omit the section rather than guessing.

## Most wins

Show up to three players sorted by wins, win percentage, matches played, then name. Use a compact list without rank numbers or podium styling. Label the section `Most wins` and state that the figures come from recorded matches.

## Players

Provide search plus `All` and `Undefeated` filters. Keep the list visible when a player is selected; selected-player state filters results and can be cleared independently. Use canonical compact list and avatar treatments and preserve favourite actions.

## Results

Use a horizontally scrollable canonical `FilterBar` for source stages. Convert source keys such as `quarter_final` and `semi_final` into readable display labels without changing the stored values used for filtering.

Player and stage filters compose. Group results by source stage, use correct singular/plural copy, and show one compact outcome indicator per row rather than duplicating large icons, text, and W/L pills.

## Testing and verification

Cover:

- round label formatting
- valid final and semi-final derivation
- incomplete or ambiguous final data
- invalid semi-final paths
- third-place-match handling
- design-system usage guard
- mobile production build
- complete mobile test suite

Run `pnpm check:design-system`, `pnpm mobile:build`, and the mobile tests before completion.
