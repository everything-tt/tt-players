# TT Players Design-System Inventory

## Status legend

- **Canonical**: new and migrated screens should use this API.
- **Compatibility**: supported during migration but should not define final geometry.
- **Domain composition**: application-specific composition built from canonical primitives.
- **Retire**: remove after all consumers migrate.

## Canonical primitives

| Area | Component | Status | Notes |
|---|---|---|---|
| Shell | `AppShellPage`, `AppPageContent`, `AppHeader`, `AppTabBar` | Canonical | Own safe areas, content clearance and navigation semantics through `styles/app-shell.css`. |
| Layout | `Stack`, `Inline` | Canonical | Replace one-off flex and gap utilities. |
| Surface | `Surface`, `PageSection` | Canonical | Explicit canvas, flat, raised and hero roles; `PageSection` also owns primary/standard/secondary heading hierarchy. |
| Identity | `EntityHero` | Canonical | Player, team, league and tournament identity. Use `highlightsSeparated` instead of styling its highlight internals. |
| Data | `MetricGrid` | Canonical | Two to four metrics with `separators`, value-size and label-style variants. |
| Filters | `FilterBar`, `SegmentedToggle`, `AppToggleButton` | Canonical | Compact controls, narrow-screen scrolling, and explicit default/icon/filter toggle variants. |
| Search | `SearchToolbar`, `AppSearchInput` | Canonical | Shared search row and action placement. |
| Lists | `DesignList`, `DesignAvatar`, `ListItem` | Canonical | Explicit compact/comfortable/editorial density, flat/grouped surface, and single-line/multiline/rich text wrapping. |
| Match records | `MatchRecordRow` | Canonical | Compact completed player matches and team fixtures with a leading score, metadata, primary row action and up to two direct actions. Consumers own score orientation and business logic. |
| States | `EmptyState`, `ErrorState`, `AppLoadingCard` | Canonical | Shared loading, empty and error treatments. |
| Actions | `AppButton`, `MoreButton`, `ExternalLinkButton` | Canonical | Semantic buttons with minimum interaction targets. Use `iconOnly` for compact icon actions. |
| Overlay | `BottomSheet` | Canonical | Mobile overlay foundation. |
| Status | `Pill`, `OutcomeBadge`, `RankBadge`, `IconCircle` | Canonical | Shared sports status and summary language. Use `OutcomeBadge` for form/summary indicators, not as a duplicate result beside `MatchRecordRow`. |

## CSS ownership boundary

A design-system component owns the geometry and typography of its canonical class family. Application CSS may:

- place a component root within a screen;
- style application-owned wrappers and domain content passed into slots;
- select a supported component prop or variant in TSX;
- define domain state that the shared component does not represent.

Application CSS must not target canonical internals such as `.tt-list-item__title`, `.tt-section-header__action`, `.tt-metric__value`, `.tt-segmented__btn`, `.tt-btn`, or `.tt-entity-hero__highlights` to change padding, height, typography, radii, separators, or interaction geometry. When a repeated need appears, add a generic variant under `packages/design-system` and use that variant from the screen.

Canonical shared styles now live in:

- `packages/design-system/src/styles/tokens.css`
- `packages/design-system/src/styles/primitives.css`
- `packages/design-system/src/styles/native-search.css`
- `packages/design-system/src/styles/variants.css`
- `packages/design-system/src/styles/app-shell.css`

`apps/mobile/src/design-tokens.css`, `app-shell.css`, and `ratings-ui.css` remain legacy canonical owners while their remaining rules move into the package. They are not a precedent for adding new application-level component internals.

## `MatchRecordRow` usage boundary

Use it for one compact **completed result**:

- player Recent Matches and full match history;
- Home and Leagues recent team results;
- completed Team page fixtures;
- H2H meeting history;
- tournament result lists.

Do not use it for standings, rankings, form strips, upcoming fixtures, fixture hero scores, or the detailed two-sided rubber scorecard on `FixturePage`.

Score values may be detailed (`3–1`), outcome-only (`W`, `L`, `D`), or unknown (`—`). The application must orient the score for the page context before passing it to the component.

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

The compatibility layers have a narrower role:

- `apps/mobile/src/mobile-polish.css` contains platform normalisation and legacy player/search composition only.
- `apps/mobile/src/density-pass.css` contains legacy player, root-navigation and drawer composition only.
- `apps/mobile/src/uncarded-density.css` contains legacy player/chart placement only.
- `apps/mobile/src/native-mobile.css` contains native interaction, modal, drawer-switch and accessibility behaviour.

They must not redefine canonical list, avatar, segmented-control, card, state, hero, app-header or tab-bar internals. The design-system guard enforces this for every non-allowlisted selector family.

The remaining page-level migration exceptions are selector-family scoped in `scripts/check-design-system-usage.mjs` for:

- `native-mobile.css`
- `player-insights.css`
- `leagues-dashboard.css`
- `my-tt.css`
- `h2h-ui.css`
- `ratings-enhancements.css`

An exception permits only the listed family in that file; a new component family still fails CI. Remove each exception as its screen adopts a shared variant.

## Screen migration matrix

| Journey | Main files | Status |
|---|---|---|
| Shared shell and navigation | `AppRouter.tsx`, `TabFooterBar.tsx`, `RootHeader.tsx`, `DetailHeader.tsx`, `MainDrawer.tsx` | Shared app header and tab bar package-owned; root navigation cleanup pending |
| Home/root tabs | `App.tsx`, `HomeTabContent.tsx` | Latest-results records migrated; wider root migration pending |
| Leagues root | `LeaguesTabContent.tsx` | Migrated, with selector-family cleanup pending |
| Events/Tournaments root | `EventsTabContent.tsx` | Migrated to grouped/editorial/rich list and toggle variants; no component-internal CSS |
| H2H root | `H2HTabContent.tsx`, `RatingPredictionPanel.tsx` | Migrated, including meeting-history records; section-spacing cleanup pending |
| Player search/favourites | `App.tsx` player tab content | Legacy allowlist; migration pending |
| Player profile | `PlayerPage.tsx`, `PlayerRatingPanel.tsx`, `PlayerMatchList.tsx` | Rating and match-record presentations migrated; remaining profile cleanup pending |
| Player insights/history | `PlayerInsightsPage.tsx`, `PlayerMatchesPage.tsx`, `PlayerTournamentsPage.tsx`, `MatchJournalPage.tsx` | Matches, tournaments and journal migrated; metric/section cleanup pending |
| Ratings | `TopRatingsPage.tsx`, rating panels | Leaderboard and rating panel migrated; heading/pagination cleanup pending |
| League detail | `LeagueDetailPage.tsx` | Migrated |
| Teams and fixtures | `TeamPage.tsx`, `FixturePage.tsx` | Team result rows migrated; specialist fixture scorecards intentionally retained |
| Event detail | `EventDetailPage.tsx` | Result rows migrated; wider page remains on the legacy allowlist |
| Utility | `AboutTabContent.tsx`, `DataCoveragePage.tsx` | Migrated |
| Component catalogue | `DesignSystemPage.tsx` | Added at `/design-system`, including `MatchRecordRow` states |

## Enforcement

- `pnpm check:design-system` prevents new non-allowlisted legacy section wrappers.
- It rejects inline canonical geometry outside documented temporary exceptions.
- It parses application CSS selectors and rejects targeting canonical component families.
- Temporary CSS exceptions are scoped by file **and selector family**, not by an unrestricted file allowlist.
- It rejects canonical geometry token declarations outside the design-system token layer.
- `scripts/__tests__/check-design-system-usage.test.mjs` verifies nested media-query parsing, family detection, temporary exceptions and token ownership.
- Mobile CI runs this guard before build and tests.

## Migration acceptance

A screen is design-system compatible when:

1. its top-level sections use `PageSection`, `EntityHero` or a documented exception;
2. repeated flex/gap geometry uses `Stack` or `Inline`;
3. lists use explicit density, surface and text behaviour through `DesignList`;
4. completed result rows use `MatchRecordRow` where the usage boundary applies;
5. card, flat and hero surfaces are selected explicitly rather than inferred by screen classes;
6. screen CSS contains domain presentation only, not canonical row heights, gutters, header heights, radii, typography, separators or touch-target geometry;
7. light, dark, reduced-motion and 320px-width checks pass.
