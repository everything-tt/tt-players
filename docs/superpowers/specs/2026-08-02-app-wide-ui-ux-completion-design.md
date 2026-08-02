# TT Players App-Wide UI/UX Completion Design

**Date:** 2026-08-02  
**Status:** Approved design baseline  
**Scope:** `apps/mobile`, `packages/design-system`, focused UI-review tests and design-system documentation

## 1. Purpose

TT Players already has a strong premium-native sports design direction and a substantial shared design system. The remaining work is not a redesign. It is a systematic completion pass that removes migration debt, aligns every page and state with the same design language, and fixes both visible and subtle usability defects.

The target experience is:

- visually cohesive across every root, detail and utility page;
- polished at the level of spacing, alignment, typography, interaction feedback and state transitions;
- efficient for dense sports information without looking like a generic dashboard;
- predictable on Android and iOS-sized browsers and when installed as a PWA;
- maintainable through shared components and tokens rather than screen-specific corrective CSS.

This design extends the existing mobile polish and design-system consolidation work. Existing successful patterns are retained and completed rather than replaced.

## 2. Success criteria

The project is complete when:

1. Every reviewable page uses the shared application shell, headers, section hierarchy, state components, lists, actions and overlays, or has a documented specialist exception.
2. Similar information is presented with the same component and interaction model across the app.
3. Canonical geometry is owned by `packages/design-system`, not by page selectors or compatibility stylesheets.
4. The remaining compatibility CSS layers are removed or reduced to explicitly documented non-geometric domain styles.
5. All materially changed journeys work at 320px, 360px, 390px, 430px and wider phone/tablet widths.
6. Light mode, dark mode and reduced-motion behaviour are intentional and consistent.
7. Loading, empty, partial-data, error and long-content states are as polished as normal populated states.
8. Interactive controls use correct semantics, visible focus treatment, accessible naming and at least 44px touch targets.
9. A focused Playwright scenario exercises every materially changed journey and records review screenshots through the existing manifest/report pipeline.
10. Design-system usage guards, mobile tests and the production build pass.

## 3. Product and visual direction

### 3.1 Preserve

The following remain stable unless a clear usability defect requires a targeted adjustment:

- the five-tab information architecture;
- the current navigation model and direct-link routes;
- green/orange brand character;
- premium native-mobile sports presentation;
- current product functionality and data semantics;
- information density appropriate for rankings, fixtures, results and statistics;
- established player, team, league, tournament, fixture and H2H journeys.

### 3.2 Improve

The completion pass may change:

- spacing, alignment and typography hierarchy;
- section ordering where the current hierarchy is unclear;
- visible action placement and overflow behaviour;
- local layouts that duplicate a shared design-system pattern;
- loading, empty, error and partial-data presentation;
- responsive wrapping and truncation rules;
- button/link semantics, focus management and keyboard behaviour;
- motion and transition details;
- inconsistent icons, labels and status treatments;
- page CSS that owns canonical design geometry.

### 3.3 Avoid

The app must not become:

- an endless stack of raised cards;
- a generic analytics dashboard;
- visually sparse at the expense of useful sports information;
- excessively animated;
- dependent on new styling frameworks or runtime UI libraries;
- composed of one-off page components that merely resemble shared components.

## 4. Design-system architecture

### 4.1 Source of truth

`packages/design-system` owns final values and behaviour for:

- spacing and layout gaps;
- page gutters and content clearance;
- typography roles;
- surface, border, radius and elevation roles;
- compact and comfortable list density;
- input and control heights;
- touch targets;
- shell, header and bottom-navigation geometry;
- safe-area behaviour;
- semantic outcome/status colours;
- motion duration and reduced-motion fallbacks.

`apps/mobile` owns domain composition and business meaning, including which statistics are primary, score orientation, result outcome, league terminology and entity-specific actions.

### 4.2 Canonical compositions

The completion pass should prefer the existing shared APIs:

- `AppShellPage`, `AppPageContent`, `BrowsePage`, `DetailPage`;
- `AppHeader`, `AppTabBar`;
- `Stack`, `Inline`, `Surface`, `PageSection`;
- `EntityHero`, `MetricGrid`, `FilterBar`, `SegmentedToggle`;
- `DesignList`, `DesignAvatar`, `ListItem`;
- `MatchRecordRow` for completed result records within its documented usage boundary;
- `EmptyState`, `ErrorState`, `AppLoadingCard`;
- `AppButton`, `MoreButton`, `ExternalLinkButton`, `ActionMenu`;
- `BottomSheet` and shared overlay/backdrop behaviour;
- `Pill`, `OutcomeBadge`, `RankBadge`, `IconCircle`.

A new shared component is justified only when at least two journeys need the same structure or when a missing primitive is causing repeated accessibility or responsive defects.

### 4.3 Specialist exceptions

Not every screen must be visually identical. Specialist layouts remain appropriate for:

- the two-sided fixture rubber scorecard;
- detailed match/game scoring;
- data-entry and journal forms;
- ranking tables where aligned numeric columns are essential;
- H2H comparison layouts where two entities must remain visually distinct.

These exceptions still consume shared tokens, controls, states and shell primitives.

## 5. Application shell and navigation

### 5.1 Root pages

All five root tabs use one root-page architecture:

- consistent safe-area-aware header;
- one clear page title and optional contextual subtitle/count;
- no more than two high-priority visible actions before overflow;
- shared page gutters and section rhythm;
- bottom navigation clearance owned by the shell;
- preserved tab navigation and scroll state.

Root pages must not use page-specific header geometry or duplicate toolbar implementations.

### 5.2 Detail pages

Detail routes use one detail-page architecture:

- Back as the primary left action;
- concise title with predictable truncation;
- contextual right actions using shared buttons or overflow;
- no duplicate Home action where tab navigation already provides recovery;
- consistent header-to-content spacing;
- browser and system-back behaviour aligned with application history.

### 5.3 Overlays

Opening a sheet, menu or dialog must:

- prevent background interaction;
- preserve visible context without accidental scroll;
- trap or manage focus appropriately;
- close through the topmost back action, Escape where supported, backdrop and explicit close action;
- restore focus to the initiating control;
- respect bottom safe areas and keyboard appearance.

## 6. Page and component consistency rules

### 6.1 Page hierarchy

Every page presents information in this order unless domain needs require a documented exception:

1. identity or page purpose;
2. current state or most important summary;
3. primary action or filter;
4. main operational content;
5. secondary detail and supporting explanation.

Section titles, descriptions, counts and actions use the same hierarchy across pages. Counts and statuses are metadata, not competing headings.

### 6.2 Spacing and containment

- Adjacent sections use tokenised gaps rather than accumulated margins.
- List rows, cards and controls align to the same page grid.
- No content touches the viewport edge unintentionally.
- Long names, league labels, round names and numeric values must not push actions off-screen.
- Horizontal scrolling is reserved for intentionally tabular or filter content, never used to hide layout defects.
- Floating or sticky controls must not obscure the final content row.

### 6.3 Typography

- One semantic typography role is used for each information purpose.
- Player names, event names, scores, ranks and ratings receive controlled emphasis.
- Supporting copy remains readable and meets contrast requirements.
- Ratings, rankings, scores, percentages and records use tabular numerals where alignment matters.
- Truncation is applied only where the full value remains available through context, navigation or an accessible label.

### 6.4 Colour and status

- Win, loss, draw, warning, error, selected and disabled states use the same semantic tokens everywhere.
- Colour is not the sole indication of outcome or selection.
- Brand accent is used selectively for identity, selection and important actions.
- Dark mode maintains clear surface separation without relying on excessive borders or shadows.

### 6.5 Actions

- Navigation uses links; in-place actions use buttons.
- Icon-only actions have stable accessible labels and tooltips where appropriate.
- Destructive actions require clear confirmation proportional to their consequence.
- Loading actions prevent duplicate submission and retain a stable control width where possible.
- Disabled actions remain legible and communicate why they are unavailable when that reason is not obvious.

## 7. Journey-specific review scope

### 7.1 Home

Review the complete root structure, navigation shortcuts, recent results, featured information, personalisation states and section rhythm. Remove any remaining legacy section wrappers and ensure all completed results use the canonical result-row presentation.

### 7.2 Players root and search

Review following-first presentation, global search, result loading, follow/unfollow actions, empty-following and no-search-results states. Search and following modes must feel like one coherent page rather than two independently styled tools.

### 7.3 Player profile and subpages

Align identity hero, rating summary, insights, recent matches, tournaments, journal actions and destructive identity actions. Full-history pages must share the same row anatomy and header rhythm as previews while retaining appropriate density.

### 7.4 Leagues, teams and fixtures

Align league browse, league details, standings, divisions, teams, fixtures and results. Upcoming fixtures and completed results must remain visually distinct. Specialist fixture scorecards are retained but brought into the same shell, typography and action language.

### 7.5 Events and tournaments

Align browse tabs, event identity, status, favourite action, event information and result lists. Long event names and sparse/partial tournament data require explicit resilient layouts.

### 7.6 H2H and common opponents

Keep Player A and Player B visually distinct while aligning pickers, saved comparisons, prediction, meetings and common-opponent records with shared controls and sections. Comparison content must remain legible on 320px screens without overlap or ambiguous ownership.

### 7.7 Utility and system surfaces

Review About, Data Coverage, design-system catalogue, PWA install/update prompts, feedback flows, menus and confirmation sheets. Utility screens must feel like part of TT Players rather than developer or framework defaults.

## 8. State quality

Every data-driven section must deliberately support:

- initial loading;
- background refresh without destructive layout replacement;
- empty data;
- filtered empty data;
- recoverable request error;
- partial data where some optional fields are missing;
- stale-but-usable data where supported;
- exceptionally long text and large numeric values.

Skeletons or loading placeholders should approximate final geometry to minimise layout shift. Errors provide a useful recovery action when one exists. Empty states explain what the user can do next without overstating unavailable functionality.

## 9. Accessibility and native-mobile behaviour

The review includes:

- logical heading hierarchy and landmarks;
- correct link/button/switch semantics;
- accessible names for icons and abbreviations;
- focus-visible treatment and predictable keyboard order;
- sufficient text and non-text contrast;
- 44x44px minimum targets for primary interactive controls;
- no hover-only essential affordance;
- reduced-motion support for all non-essential transitions;
- topmost-overlay back handling;
- safe-area support at the top and bottom;
- keyboard-safe forms and sheets;
- live-region treatment for meaningful asynchronous success and error messages.

## 10. Responsive and theme matrix

Materially changed screens are reviewed at:

- 320px narrow phone;
- 360px compact Android;
- 390px standard modern phone;
- 430px large phone;
- one wider/tablet viewport to verify content-width behaviour.

Each representative journey is checked in light and dark modes. Reduced motion is checked for shell transitions, sheets, loading indicators and state changes.

The review must include at least one long-content fixture per major entity type so responsive success is not based only on short production names.

## 11. Implementation strategy

Work proceeds in coherent batches rather than random visual edits:

1. Lock the audit inventory and add failing contracts for remaining migration debt.
2. Complete shell, header, navigation and shared responsive primitives.
3. Complete root pages, starting with Home and Players.
4. Complete Player profile and subpages.
5. Complete Event detail and remaining league/team/fixture inconsistencies.
6. Complete utility screens and overlays.
7. Remove obsolete compatibility CSS and tighten the design-system usage guard.
8. Run the full manual and automated review matrix and fix final micro-defects.

Each batch must remain buildable. Shared changes should be introduced before migrating their consumers. Page-specific CSS patches must not be used to conceal a missing shared variant.

## 12. Testing and review

### 12.1 Component and contract tests

Add or refine tests for:

- semantic component structure and variants;
- shell clearance and safe-area classes;
- explicit list density;
- header action capacity and overflow;
- long-content containment;
- shared state presentation;
- design-system usage guardrails;
- removal of banned compatibility geometry.

### 12.2 Focused Playwright review

Following `AGENTS.md`, the UI pull request will include one descriptive `*.pw.ts` scenario under `apps/mobile/tests/ui-review/` and set `playwright.ui-review.config.ts` to that scenario only.

The scenario will:

- cover every materially changed journey;
- use rendered state or API readiness rather than fixed sleeps;
- assert functional behaviour and responsive containment before screenshots;
- capture a small, relevant light/dark and narrow/standard set;
- publish through the existing UI-review manifest/report mechanism.

The broad post-deploy main audit remains separate and non-blocking.

### 12.3 Required verification

Before the change is ready for review:

- design-system component tests pass;
- mobile unit/integration tests pass;
- `pnpm check:design-system` passes;
- TypeScript and production build pass;
- the focused Playwright review passes and produces its report;
- no unexpected horizontal overflow appears in the viewport matrix;
- console errors and unhandled request errors are absent from reviewed flows.

## 13. Documentation updates

The implementation updates:

- `docs/design-system/component-inventory.md` with final migration status;
- design-system usage guidance where new or refined variants are introduced;
- any documented specialist exceptions;
- the focused UI-review scenario selection in `playwright.ui-review.config.ts`.

Obsolete plans and historical reviews remain as history; this specification is the acceptance baseline for the completion pass.

## 14. Non-goals

This project does not include:

- new product features unrelated to usability or consistency;
- backend data-model or API redesign unless required to render an existing state correctly;
- a new brand, colour palette or navigation architecture;
- separate Android and iOS component implementations;
- replacing React, Vite, TanStack Query or the current design-system package;
- exhaustive screenshot coverage of every production record.

## 15. Final acceptance checklist

The work is accepted only when:

- every route in `AppRouter.tsx` has been reviewed;
- every root and detail page follows the same shell and hierarchy rules;
- all repeated UI patterns use canonical components;
- no newly introduced screen selector owns canonical geometry;
- compatibility CSS no longer determines final shell, spacing, density, radius or touch-target values;
- light, dark, reduced-motion and responsive checks pass;
- loading, empty, error and partial states are intentional;
- accessibility and semantic interaction checks pass;
- the focused Playwright report clearly demonstrates the changed journeys;
- documentation accurately matches the implemented system.
