# H2H verdict and evidence redesign

## Goal

Make the completed H2H page read as one coherent story: a dominant matchup verdict, compact supporting evidence, shared-opponent detail, and direct history only when it exists.

## Leading section

The first completed-matchup section owns the matchup title, page actions, model verdict, win probabilities, current ratings, probability bar, and confidence. Remove the separate career win-rate header because those values compete with the actual prediction and are easy to misread as the verdict.

Place swap, save, share, and clear controls in a dedicated action row below the matchup title rather than beside it. The matchup identity and verdict must remain visually dominant on narrow screens.

## Evidence hierarchy

Remove the separate Match preparation and Why this prediction sections. Replace Current evidence with a single compact evidence section using consistent list rows for ability rating, recent form, shared opponents, and direct meetings. Each row contains a short label, a concise comparison, and an optional edge value; avoid repeated large success icons and repeated prose.

## Detail sections

Keep Common opponents as the primary drill-down and retain its paginated list. Show Direct record, By competition, and Meeting history only when direct encounters exist. When no meetings exist, the Direct meetings evidence row is sufficient; do not render a large empty-state illustration.

## Design-system constraints

Reuse PageSection, DesignList, ListItem, MetricGrid, AppButton, FavouriteButton, DesignAvatar, EmptyState, ErrorState, Inline, Stack, and existing semantic tokens. Add only scoped H2H layout classes; do not introduce a new token system or component library.

## Behaviour preserved

Preserve player selection, saved matchups, profile navigation, swap, favourite, share, clear, persisted active players, loading and error states, common-opponent pagination, and fixture navigation.