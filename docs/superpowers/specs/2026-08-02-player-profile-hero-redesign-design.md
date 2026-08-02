# Player profile hero redesign

## Goal

Make the player profile open with one cohesive raised summary card that uses the same hierarchy and visual language as the completed H2H hero while keeping player identity as the primary headline.

## Hero hierarchy

Keep the player name as the dominant title, preceded by the `Player profile` eyebrow and accompanied by a compact initials avatar and the existing matches/wins/win-rate summary.

Place the profile actions directly inside the hero. The default action set is Save/Follow, Share, View Rating History, and Insights. When the profile belongs to the current user, replace Save/Follow with `This isn’t me`; do not display both controls together.

## Unified summary

Merge Ability Rating and Form into the hero rather than rendering them as separate page sections. Show Rating, Global Rank, Confidence, Likely Range, and Win Rate as a compact responsive metric layout. Win Rate remains supporting information and must not return as the oversized spotlight used by the old hero.

Show Rolling 10, Rolling 20, and Momentum as three consistent form tiles inside the same card. Retain the compact recent-result badges beneath the form tiles so existing form context is preserved.

The likely range remains expandable and continues to show the low, estimate, and high values when opened. Rating loading, unavailable, provisional, and confidence states remain supported.

## Component boundary

Introduce a focused `PlayerProfileHero` component that owns the hero presentation, rating query, share action, expandable rating range, profile action hierarchy, and form summary. `PlayerPage` remains responsible for data loading, identity/favourite state, navigation callbacks, and the remaining page sections.

The existing standalone `PlayerRatingPanel` is removed from `PlayerPage` but retained for other potential consumers unless repository search confirms it is unused and safe to delete in a later cleanup.

## Design-system constraints

Reuse existing app-kit buttons, `FavouriteButton`, `FormResultPills`, rating query helpers, semantic tokens, and Font Awesome icons. Add only scoped player-profile hero styles in a dedicated stylesheet. Do not introduce a new component library or token set.

## Behaviour preserved

Preserve favourite toggling, identity clearing, sharing, Insights navigation, Rating History navigation, rating-range expansion, loading/error states, current-season navigation, recent matches, and all existing profile metadata behaviour.
