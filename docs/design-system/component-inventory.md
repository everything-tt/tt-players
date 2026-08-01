# TT Players Design-System Inventory

## Status legend

- **Canonical**: new and migrated screens should use this API.
- **Compatibility**: supported during migration but should not define final geometry.
- **Domain composition**: application-specific composition built from canonical primitives.
- **Retire**: remove after all consumers migrate.

## Canonical primitives

| Area | Component | Status | Notes |
|---|---|---|---|
| Shell | `AppShellPage`, `AppPageContent`, `AppHeader`, `AppTabBar` | Canonical | Own safe areas, content clearance and navigation semantics. |
| Layout | `Stack`, `Inline` | Canonical | Replace one-off flex and gap utilities. |
| Surface | `Surface`, `PageSection` | Canonical | Explicit canvas, flat, raised and hero roles; `PageSection` also owns primary/standard/secondary heading hierarchy. |
| Identity | `EntityHero` | Canonical | Player, team, league and tournament identity. |
| Data | `MetricGrid` | Canonical | Two to four key metrics with responsive fallback. |
| Filters | `FilterBar`, `SegmentedToggle` | Canonical | Compact controls and narrow-screen horizontal scrolling. |
| Lists | `DesignList`, `DesignAvatar`, `ListItem` | Canonical | Explicit compact or comfortable density. |
| States | `EmptyState`, `ErrorState`, `AppLoadingCard` | Canonical | Shared loading, empty and error treatments. |
| Actions | `AppButton`, `MoreButton`, `ExternalLinkButton` | Canonical | Semantic buttons with minimum interaction targets. |
| Overlay | `BottomSheet` | Canonical | Mobile overlay foundation. |
| Status | `Pill`, `OutcomeBadge`, `RankBadge`, `IconCircle` | Canonical | Shared sports status and result language. |

## Compatibility components

| Component | Status | Migration direction |
|---|---|---|
| `HeroCard` | Compatibility | Replace with `EntityHero` or `PageSection surface="raised"`. |
| `List` and legacy `size` values | Compatibility | Use `DesignList density`. |
| `Avatar` legacy `sm/md/lg` values | Compatibility | Use `DesignAvatar compact/standard/hero`. |
| `AppCard` | Compatibility | Retain for messages; ordinary screen sections use `PageSection`. |
| `PageSection note` | Compatibility | Use `description` for copy and `meta` for counts/status. |
| AppKit classes | Compatibility | Preserve behaviour while removing geometry ownership. |

## Temporary CSS layers

The following files remain compatibility-only until the final large legacy screens migrate:

- `apps/mobile/src/mobile-polish.css`
- `apps/mobile/src/density-pass.css`
- `apps/mobile/src/uncarded-density.css`

Final geometry now lives in `packages/design-system/src/styles/tokens.css` and `primitives.css`. Compatibility files may consume those values but must not become the source of truth.

## Screen migration matrix

| Journey | Main files | Status |
|---|---|---|
| Shared shell and navigation | `AppRouter.tsx`, `TabFooterBar.tsx`, `RootHeader.tsx`, `DetailHeader.tsx`, `MainDrawer.tsx` | Foundation migrated; compatibility cleanup pending |
| Home/root tabs | `App.tsx` | Legacy allowlist; migration pending |
| Leagues root | `LeaguesTabContent.tsx` | Migrated |
| Events/Tournaments root | `EventsTabContent.tsx` | Migrated |
| H2H root | `H2HTabContent.tsx`, `RatingPredictionPanel.tsx` | Migrated; first semantic section-header consumer |
| Player search/favourites | `App.tsx` player tab content | Legacy allowlist; migration pending |
| Player profile | `PlayerPage.tsx`, `PlayerRatingPanel.tsx` | Rating panel migrated; main profile pending |
| Player insights/history | `PlayerInsightsPage.tsx`, `PlayerMatchesPage.tsx`, `PlayerTournamentsPage.tsx`, `MatchJournalPage.tsx` | Matches, tournaments and journal migrated; insights pending |
| Ratings | `TopRatingsPage.tsx`, rating panels | Leaderboard and rating panel migrated |
| League detail | `LeagueDetailPage.tsx` | Migrated |
| Teams and fixtures | `TeamPage.tsx`, `FixturePage.tsx` | Migrated |
| Event detail | `EventDetailPage.tsx` | Legacy allowlist; migration pending |
| Utility | `AboutTabContent.tsx`, `DataCoveragePage.tsx` | Migrated |
| Component catalogue | `DesignSystemPage.tsx` | Added at `/design-system` |

## Enforcement

- `pnpm check:design-system` prevents new non-allowlisted legacy section wrappers.
- It rejects inline canonical geometry outside documented temporary exceptions.
- It rejects canonical token declarations outside the design-system token layer.
- Mobile CI runs this guard before build and tests.

## Migration acceptance

A screen is design-system compatible when:

1. its top-level sections use `PageSection`, `EntityHero` or a documented exception;
2. repeated flex/gap geometry uses `Stack` or `Inline`;
3. lists use explicit density through `DesignList`;
4. card, flat and hero surfaces are selected explicitly rather than inferred by screen classes;
5. screen CSS contains domain presentation only, not canonical row heights, gutters, header heights, radii or touch-target geometry;
6. light, dark, reduced-motion and 320px-width checks pass.
