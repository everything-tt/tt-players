# Player profile hero redesign

## Goal

Make the player profile open with one cohesive raised summary card that uses the same hierarchy and visual language as the completed H2H hero while keeping player identity as the primary headline.

## Hero hierarchy

Keep the player name as the dominant title, preceded by the `Player profile` eyebrow and accompanied by the existing matches/wins/win-rate summary. Anchor the identity copy on the left and place the compact initials avatar on the right so the name leads the reading order.

Place the profile actions directly inside the hero. The default action set is Save/Follow, History, Insights, and Share. When the profile is claimed by the current user, remove Save/Follow and keep the three everyday actions in an equal-width row.

Treat ownership as a reversible account link rather than a data mismatch. Show `Claimed as your profile · Undo claim` as quiet footer state after the form summary. `Undo claim` opens a confirmation sheet explaining that the player record will no longer be linked to the account and that no match data will be deleted.

## Unified summary

Merge Ability Rating and Form into the hero rather than rendering them as separate page sections. Show Rating, Global Rank, and Win Rate as three equal-width metrics. Put confidence below Rating and inside the full-width Likely Range evidence row instead of giving confidence a competing top-level metric. Win Rate remains supporting information and must not return as the oversized spotlight used by the old hero.

Show Rolling 10, Rolling 20, and Momentum as three consistent form tiles inside the same card. Retain the compact recent-result badges beneath the form tiles so existing form context is preserved.

The likely range remains expandable and continues to show the low, estimate, and high values when opened. Rating loading, unavailable, provisional, and confidence states remain supported.

## Component boundary

Introduce a focused `PlayerProfileHero` component that owns the hero presentation, rating query, share action, expandable rating range, profile action hierarchy, and form summary. `PlayerPage` remains responsible for data loading, identity/favourite state, navigation callbacks, and the remaining page sections.

The existing standalone `PlayerRatingPanel` is removed from `PlayerPage` but retained for other potential consumers unless repository search confirms it is unused and safe to delete in a later cleanup.

## Design-system constraints

Reuse existing app-kit buttons, `FavouriteButton`, `FormResultPills`, rating query helpers, semantic tokens, and Font Awesome icons. Add only scoped player-profile hero styles in a dedicated stylesheet. Do not introduce a new component library or token set.

## Behaviour preserved

Preserve favourite toggling, confirmed identity unlinking, sharing, Insights navigation, Rating History navigation, rating-range expansion, loading/error states, current-season navigation, recent matches, and all existing profile metadata behaviour.
