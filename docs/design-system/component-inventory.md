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
| Surface | `Surface`, `PageSection` | Canonical | Explicit canvas, flat, raised and hero roles. |
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
| AppKit classes | Compatibility | Preserve behaviour while removing geometry ownership. |

## Temporary CSS layers

The following files remain compatibility-only until all screens use explicit variants:

- `apps/mobile/src/mobile-polish.css`
- `apps/mobile/src/density-pass.css`
- `apps/mobile/src/uncarded-density.css`

Final geometry must move to `packages/design-system/src/styles/tokens.css` and `primitives.css`. These files are retired in the final migration task.

## Screen migration matrix

| Journey | Main files | Status |
|---|---|---|
| Shared shell and navigation | `AppRouter.tsx`, `TabFooterBar.tsx`, `RootHeader.tsx`, `DetailHeader.tsx`, `MainDrawer.tsx` | Foundation migrated; consolidation pending |
| Home/root tabs | `App.tsx`, `LeaguesTabContent.tsx`, `EventsTabContent.tsx`, `H2HTabContent.tsx` | Pending |
| Player search/favourites | `App.tsx` player tab content | Pending |
| Player profile | `PlayerPage.tsx`, `PlayerRatingPanel.tsx` | Rating panel migrated; hero and remaining sections pending |
| Player insights/history | `PlayerInsightsPage.tsx`, `PlayerMatchesPage.tsx`, `PlayerTournamentsPage.tsx`, `MatchJournalPage.tsx` | Pending |
| Ratings | `TopRatingsPage.tsx`, rating panels | Leaderboard and rating panel migrated |
| Leagues | `LeagueDetailPage.tsx`, `LeaguesTabContent.tsx` | Pending |
| Teams and fixtures | `TeamPage.tsx`, `FixturePage.tsx` | Pending |
| Events/tournaments | `EventsTabContent.tsx`, `EventDetailPage.tsx` | Pending |
| Utility | `AboutTabContent.tsx`, `DataCoveragePage.tsx`, feedback and selection pages | About migrated; remaining utility screens pending |

## Migration acceptance

A screen is design-system compatible when:

1. its top-level sections use `PageSection`, `EntityHero` or a documented exception;
2. repeated flex/gap geometry uses `Stack` or `Inline`;
3. lists use explicit density through `DesignList`;
4. card, flat and hero surfaces are selected explicitly rather than inferred by screen classes;
5. screen CSS contains domain presentation only, not canonical row heights, gutters, header heights, radii or touch-target geometry;
6. light, dark, reduced-motion and 320px-width checks pass.
