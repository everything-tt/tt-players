# Reusable Design System Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the visual foundation merged in PR #49 into a fully reusable, centrally tokenised design system and migrate every current mobile screen to explicit shared variants without changing product behaviour.

**Architecture:** `packages/design-system` becomes the source of truth for geometry, density, surfaces, typography roles and interaction states. `apps/mobile` retains only domain compositions and brand-specific content. The three compatibility stylesheets introduced during the visual exploration are consolidated into a canonical design-system stylesheet and explicit component APIs, followed by a screen-by-screen migration and removal of selector-based geometry overrides.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, CSS custom properties, existing `@tt-players/design-system` package, Playwright or the repository's available browser test harness for visual contracts.

## Global Constraints

- Preserve the current five-tab information architecture and all existing navigation behaviour.
- Preserve the approved premium-native, sports-oriented appearance from PR #49.
- Preserve safe-area handling and minimum `44x44px` interaction targets.
- Keep dense operational lists around `54–56px` while allowing explicit comfortable variants.
- Keep flat sections at `12px` gutters on standard phones and `10px` on narrow phones.
- Do not introduce screen-name selectors into the canonical design-system stylesheet.
- Do not add a second styling framework or runtime UI dependency.
- Keep every migration commit independently buildable and testable.
- Light mode, dark mode, reduced motion and widths down to `320px` are required.

---

### Task 1: Inventory and lock the canonical design-system contract

**Files:**
- Create: `docs/design-system/component-inventory.md`
- Create: `packages/design-system/src/components/design-system-contract.test.tsx`
- Modify: `packages/design-system/src/index.ts`

**Interfaces:**
- Produces canonical component names and variant types used by all later tasks.
- Produces a migration matrix for every mobile screen and legacy class family.

- [ ] Enumerate every reusable component exported by `packages/design-system` and classify it as retain, refine, consolidate or retire.
- [ ] Enumerate every screen in `apps/mobile/src` and record its shell, header, hero, section, list, control, state and overlay patterns.
- [ ] Write failing component-contract tests for the new APIs: `PageSection`, `Surface`, `Stack`, `Inline`, `EntityHero`, `MetricGrid`, `FilterBar`, and explicit `List density` variants.
- [ ] Verify the focused test fails because those APIs do not yet exist.
- [ ] Commit the inventory and RED tests.

### Task 2: Centralise design tokens and remove cascade-owned final values

**Files:**
- Create: `packages/design-system/src/styles/tokens.css`
- Create: `packages/design-system/src/styles/primitives.css`
- Modify: `packages/design-system/src/index.ts`
- Modify: `apps/mobile/src/main.tsx`
- Retire after migration: `apps/mobile/src/mobile-polish.css`
- Retire after migration: `apps/mobile/src/density-pass.css`
- Retire after migration: `apps/mobile/src/uncarded-density.css`

**Interfaces:**
- Produces one final token definition for spacing, density, typography, radius, surface, elevation, motion and safe-area geometry.

- [ ] Add canonical tokens including `--tt-gutter-flat`, `--tt-gutter-card`, `--tt-section-gap-flat`, `--tt-row-height-compact`, `--tt-row-height-comfortable`, `--tt-avatar-compact`, `--tt-control-height`, `--tt-header-height`, and `--tt-tab-height`.
- [ ] Add theme aliases for light and dark surfaces and semantic outcomes.
- [ ] Add focused CSS contract tests or static assertions preventing duplicate final token declarations.
- [ ] Import the canonical stylesheet once from the mobile entry point.
- [ ] Keep compatibility styles temporarily but make them consume canonical tokens rather than redefine values.
- [ ] Run mobile build and tests.
- [ ] Commit.

### Task 3: Add explicit layout and surface primitives

**Files:**
- Create: `packages/design-system/src/components/Layout.tsx`
- Create: `packages/design-system/src/components/PageSection.tsx`
- Create: `packages/design-system/src/components/Surface.tsx`
- Modify: `packages/design-system/src/index.ts`
- Test: `packages/design-system/src/components/design-system-contract.test.tsx`

**Interfaces:**
- `Stack({ gap: 'xs'|'sm'|'md'|'lg', as?, children })`
- `Inline({ gap, align, justify, wrap, children })`
- `PageSection({ surface: 'flat'|'raised'|'hero', density: 'compact'|'standard'|'editorial', title?, note?, children })`
- `Surface({ variant: 'canvas'|'subtle'|'raised'|'accent', padding: 'none'|'compact'|'standard'|'editorial' })`

- [ ] Implement failing tests for semantic markup and variant classes.
- [ ] Implement the minimal components.
- [ ] Add canonical CSS without domain or screen selectors.
- [ ] Verify tests and build.
- [ ] Commit.

### Task 4: Promote list, avatar and section-header density into component APIs

**Files:**
- Modify: `packages/design-system/src/components/List.tsx`
- Modify or create: `packages/design-system/src/components/SectionHeader.tsx`
- Modify: `packages/design-system/src/index.ts`
- Test: `packages/design-system/src/components/design-system-contract.test.tsx`

**Interfaces:**
- `List density="compact"|"comfortable"`
- `ListItem density` inherited from `List` unless overridden.
- `Avatar size="compact"|"standard"|"hero"`
- `SectionHeader density="compact"|"standard"`, note placement responsive by default.

- [ ] Write failing tests asserting explicit density classes and inheritance.
- [ ] Implement compact and comfortable list geometry in the design-system stylesheet.
- [ ] Preserve `44px` trailing action targets while reducing visible row height.
- [ ] Remove app-level geometry overrides for `.tt-list-item` and `.tt-avatar--md` once consumers migrate.
- [ ] Run all tests and build.
- [ ] Commit.

### Task 5: Add canonical hero, metric and filter compositions

**Files:**
- Create: `packages/design-system/src/components/EntityHero.tsx`
- Create: `packages/design-system/src/components/MetricGrid.tsx`
- Create: `packages/design-system/src/components/FilterBar.tsx`
- Modify: `packages/design-system/src/index.ts`
- Test: `packages/design-system/src/components/design-system-contract.test.tsx`

**Interfaces:**
- `EntityHero` provides leading identity, title, subtitle, actions, highlights and optional accent treatment.
- `MetricGrid` supports 2–4 metrics and responsive column fallback.
- `FilterBar` supports segmented controls, chips and horizontally scrollable narrow layouts.

- [ ] Write RED tests for structure, variants and accessible labelling.
- [ ] Implement components and shared CSS.
- [ ] Add dark-mode and narrow-width contracts.
- [ ] Run tests and build.
- [ ] Commit.

### Task 6: Consolidate shell, headers, navigation, states and drawer

**Files:**
- Modify: `packages/design-system/src/components/AppShell.tsx`
- Modify: `packages/design-system/src/components/AppTabBar.tsx`
- Modify: `packages/design-system/src/components/States.tsx`
- Create or modify: shared sheet/drawer primitives in `packages/design-system/src/components`
- Modify: `apps/mobile/src/components/RootHeader.tsx`
- Modify: `apps/mobile/src/components/DetailHeader.tsx`
- Modify: `apps/mobile/src/components/MainDrawer.tsx`

**Interfaces:**
- Shell components own safe areas, header/footer clearance and content width.
- Drawer and sheet primitives own focus trapping, width, row density and dismissal behaviour.

- [ ] Add regression tests for five visible footer icons, selected semantics, header action capacity and drawer landmark semantics.
- [ ] Move final geometry from app-level CSS into component variants.
- [ ] Keep product metadata and actions in app-level compositions only.
- [ ] Run tests and build.
- [ ] Commit.

### Task 7: Migrate root screens

**Files:**
- Modify: `apps/mobile/src/App.tsx`
- Modify relevant Home, Players, Leagues, Events and H2H tab components.

**Interfaces:**
- Consumes `PageSection`, `List density="compact"`, `FilterBar`, `EntityHero`, canonical states and shell components.

- [ ] Migrate Home.
- [ ] Migrate Players search and favourites.
- [ ] Migrate Leagues root and performance sections.
- [ ] Migrate Events/Tournaments root.
- [ ] Migrate H2H root.
- [ ] Remove local spacing classes rendered unnecessary by each migration.
- [ ] Add focused screen tests for loading, empty, populated and error states.
- [ ] Commit each root screen or logically coupled group separately.

### Task 8: Migrate player journeys

**Files:**
- Modify: `apps/mobile/src/PlayerPage.tsx`
- Modify player insights, matches, history, journal and rating components.

- [ ] Replace player hero geometry with `EntityHero`.
- [ ] Replace rating metric geometry with `MetricGrid`.
- [ ] Replace all flat player sections with `PageSection surface="flat"`.
- [ ] Replace all player lists with explicit compact or comfortable list variants.
- [ ] Remove `.tt-player-section` geometry from app-level CSS.
- [ ] Verify right-edge containment at 320px and 360px.
- [ ] Commit.

### Task 9: Migrate league, team, fixture and tournament journeys

**Files:**
- Modify all league, team, fixture, tournament and ranking screen components under `apps/mobile/src`.

- [ ] Use `EntityHero` for league and tournament summaries.
- [ ] Use compact `List` for standings, players, teams, fixtures and results.
- [ ] Use `FilterBar` for division, match and event filters.
- [ ] Use canonical states and skeletons.
- [ ] Remove local primitive geometry and duplicated margins.
- [ ] Commit by journey group.

### Task 10: Migrate utility screens and overlays

**Files:**
- Modify About, Data Coverage, Feedback, settings, selection pages and all sheets/dialogs.

- [ ] Migrate section and card surfaces.
- [ ] Migrate buttons, fields and state treatments.
- [ ] Ensure keyboard and safe-area behaviour.
- [ ] Remove remaining legacy primitive usage from touched screens.
- [ ] Commit.

### Task 11: Remove compatibility layers and prevent regression

**Files:**
- Delete: `apps/mobile/src/mobile-polish.css`
- Delete: `apps/mobile/src/density-pass.css`
- Delete: `apps/mobile/src/uncarded-density.css`
- Modify: `apps/mobile/src/main.tsx`
- Create: `scripts/check-design-system-usage.mjs`
- Modify mobile CI workflow.

- [ ] Remove the compatibility stylesheets after all selectors have migrated.
- [ ] Add a guard rejecting new screen-level definitions of canonical geometry properties and banned legacy classes.
- [ ] Add a guard requiring `PageSection` or documented exceptions for top-level screen sections.
- [ ] Run the guard locally and confirm it fails against a deliberate fixture before enabling it.
- [ ] Run full tests and build.
- [ ] Commit.

### Task 12: Add visual regression coverage and component catalogue

**Files:**
- Create: `apps/mobile/src/DesignSystemPage.tsx` or an equivalent development-only catalogue.
- Create visual tests for representative primitives and screens.
- Modify routing/build configuration so the catalogue is excluded or protected in production as appropriate.

- [ ] Render every primitive, density and state in light and dark themes.
- [ ] Capture 320px, 360px, 390px and large-phone visual baselines.
- [ ] Add representative Player, League, Team and Tournament screen snapshots.
- [ ] Verify footer icons, safe areas, right-edge containment and touch-target geometry.
- [ ] Commit.

### Task 13: Final audit and documentation

**Files:**
- Update: `docs/superpowers/specs/2026-07-31-mobile-density-system.md`
- Create: `docs/design-system/usage.md`
- Update: `docs/design-system/component-inventory.md`

- [ ] Mark every screen migrated or record a justified exception.
- [ ] Document all component APIs and selection guidance.
- [ ] Confirm no screen-name selector controls canonical geometry.
- [ ] Run complete mobile tests, production build, design-system guard and visual suite.
- [ ] Review light/dark, reduced motion and device-width matrix.
- [ ] Update the PR from draft only after the audit is complete.
