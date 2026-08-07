# H2H narrative redesign

## Goal

Make both H2H states easier to scan by replacing the oversized hero treatment with a compact comparison flow and a clear narrative: verdict, evidence, details, history.

## Selection state

Use a compact `PageSection` containing the two existing player pickers. Remove the decorative empty-state section. Show saved matchups directly beneath the selector so the page remains useful before a comparison is built.

## Completed matchup state

Replace the player-card hero with a compact matchup header containing the names, encounter count and page actions. Keep prediction output as the first substantive section. Consolidate supporting rationale into one `Why this prediction?` section.

## Detail hierarchy

Show direct record only when direct encounters exist. When there are no direct meetings, render one concise explanatory section stating that the prediction is based on indirect evidence. Avoid rendering separate empty sections for matchup score, event breakdown and encounter history.

## Design-system constraints

Reuse `PageSection`, `Stack`, `Inline`, `Surface`, `MetricGrid`, `DesignList`, `ListItem`, `DesignAvatar`, `AppButton`, `FavouriteButton`, `OutcomeBadge`, `EmptyState` and `ErrorState`. Do not introduce a new component library, token set or page-specific colour system.

## Behaviour preserved

Player selection, profile navigation, swapping, clearing, favourites, sharing, persisted active players, loading/error states and fixture navigation remain unchanged.
