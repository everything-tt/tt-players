# Match Score Tile Sizing Design

## Goal

Adjust the shared `MatchRecordRow` score tile so team scores such as `15–13` remain comfortable and readable on one line while the tile becomes slightly wider and shorter than the current square presentation.

## Scope

The change belongs exclusively to the design-system `MatchRecordRow` component. No Home, Player, League, Team, H2H, or Tournament consumer may add a local size override.

The existing row structure, score tones, typography weight, rounded corners, metadata wrapping, actions, navigation, and accessible score label remain unchanged.

## Geometry

The shared `.tt-match-record-score` tile will use:

- fixed width: `64px`
- fixed height: `40px`
- fixed flex basis: `64px`
- minimum height: `40px`
- horizontal padding: `4px`
- `white-space: nowrap`
- centred inline-flex alignment
- existing `17px` bold tabular-numeral typography

This is deliberately smaller than the earlier rough `104 × 60px` suggestion. The current implementation is `44 × 44px`; `64 × 40px` accurately satisfies “slightly wider and shorter” and gives a five-character score such as `15–13` enough horizontal room without taking excessive space from match titles on narrow phones.

## Responsive behaviour

The tile remains the same size for compact and standard `MatchRecordRow` densities and at phone breakpoints. The flexible title and metadata column continues to shrink or wrap before the score tile does.

No consumer-specific media query is introduced.

## Accessibility

The existing `role="img"` and complete `aria-label` remain the spoken representation of the score. The visual no-wrap rule must not replace or shorten the accessible label.

## Testing

Update the existing `MatchRecordRow` contract test first so it requires:

- rendering `15–13`
- `flex: 0 0 64px`
- `width: 64px`
- `height: 40px`
- `min-height: 40px`
- `white-space: nowrap`
- no standard-density score-size override

The test must fail against the previous `44 × 44px` CSS before the production style is changed. After implementation, run the focused test and the complete mobile test/build checks through the existing pull-request workflows.

## Acceptance criteria

- `15–13` renders as one centred line inside the shared tile.
- The tile is `64 × 40px` everywhere `MatchRecordRow` is used.
- Score tones and rounded-corner styling are unchanged.
- No page-specific score sizing is added.
- Existing mobile tests and build checks pass.
