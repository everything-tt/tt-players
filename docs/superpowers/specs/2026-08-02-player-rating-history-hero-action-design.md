# Player Rating History Hero Action

## Goal

Make rating history easier to discover from the player profile by moving its entry point into the hero action row beside **Insights**.

## Chosen approach

Add a compact outlined **Rating History** pill with the existing chart-line icon immediately after **Insights**. Remove the full-width **View Rating History** button from the Ability Rating section.

This keeps the hero as the single location for profile-level actions while leaving the Ability Rating section focused on rating information.

## Alternatives considered

1. Keep both entry points. Rejected because it duplicates navigation and adds unnecessary visual weight.
2. Add an icon-only action. Rejected because the meaning is less obvious and the hero already uses labelled pills.
3. Place the action inside the Ability Rating header. Rejected because it would introduce a one-off section-header pattern.

## UI behaviour

- Hero action order: **Save**, **Insights**, **Rating History**, then **This isn’t me** when applicable.
- The new action uses the same compact pill geometry and outlined treatment as the existing hero actions.
- The action includes the existing `fa-chart-line` icon followed by the label `Rating History`.
- Activating it navigates to `player/{playerId}/insights#rating-history`.
- The Ability Rating section no longer renders its full-width rating-history button.
- On narrow screens, the hero action row may wrap using the existing action-row layout rather than shrinking labels below comfortable tap sizes.

## Loading state

Update the player-profile skeleton so the hero action row represents three standard actions instead of two.

## Accessibility

- Keep visible text; do not rely on the chart icon alone.
- Preserve link semantics and keyboard activation through `AppButtonLink`.
- Mark the decorative icon `aria-hidden="true"`.

## Testing

Add or update UI contract coverage to verify:

- `Rating History` appears in the hero after `Insights`.
- The action targets the insights page rating-history anchor.
- The Ability Rating panel no longer contains a rating-history button.
- The hero action row remains usable at the narrow mobile viewport used by the existing UI review suite.

## Scope

No changes to rating calculation, rating-history content, routing structure, or the Insights page itself.