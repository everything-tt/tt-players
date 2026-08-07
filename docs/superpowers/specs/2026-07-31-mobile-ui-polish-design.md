# TT Players Mobile UI/UX Polish Design

**Date:** 2026-07-31  
**Status:** Proposed for implementation  
**Scope:** `apps/mobile` and `packages/design-system`

## 1. Intent

TT Players is already approximately 70% aligned with the desired experience. This project is therefore an evolutionary polish rather than a redesign.

The goal is to preserve the current product structure, information architecture, brand character, and familiar workflows while making the app feel more cohesive, attractive, premium, and native on mobile.

The target experience is **premium sports intelligence with native-mobile behaviour**:

- visually appealing enough to feel like a modern sports product;
- efficient enough for rankings, fixtures, results, and player statistics;
- comfortable and predictable on both Android and iOS;
- consistent across every screen, state, and interaction;
- recognisably the same TT Players app rather than a replacement product.

## 2. Product direction

### 2.1 Visual balance

The design language should combine:

- **60% premium native structure:** calm hierarchy, strong spacing, restrained surfaces, familiar controls;
- **30% sports editorial presentation:** confident player/event identity, expressive ranking and result treatment, selective visual emphasis;
- **10% match-day energy:** stronger colour and motion only where an outcome, live state, ranking movement, or key action benefits from it.

The app must not become a generic analytics dashboard. Avoid endless grey cards, cramped metric tiles, tiny labels, excessive borders, or every number competing for attention.

### 2.2 Platform position

The app will use a **platform-neutral branded visual system with native platform behaviour**.

Android and iOS should share the same components, colours, typography, and screen structures. Platform adaptation should happen underneath through safe areas, system back handling, input behaviour, supported haptics, sheet behaviour, and native browser/container capabilities.

Separate Android and iOS visual implementations are out of scope.

## 3. Preservation rules

The following should remain recognisable unless an audit finds a clear usability problem:

- the five-tab application structure;
- current navigation and content organisation;
- the green/orange brand character;
- the current information density;
- established player, league, tournament, fixture, and H2H journeys;
- effective card-and-list patterns already using shared components;
- existing feature behaviour and data presentation semantics.

Changes should favour refinement over novelty. A component should only be replaced when it is inconsistent, inaccessible, web-like, difficult to maintain, or visibly below the quality of the rest of the app.

## 4. Design principles

### 4.1 One system, not screen-by-screen styling

Shared design-system components and tokens are the source of truth. Screens should compose these primitives rather than create local versions of headers, cards, buttons, tabs, list rows, status badges, or state messages.

### 4.2 Native before decorative

Correct touch targets, safe areas, scrolling, focus, keyboard behaviour, pressed feedback, back navigation, and loading stability take priority over decorative styling.

### 4.3 Hierarchy before density

Each screen should make the primary identity, current state, and next action obvious. Secondary statistics remain available but should not visually compete with the screen title or principal result.

### 4.4 Selective sports emphasis

Use strong colour, large numbers, badges, and motion for meaningful sports concepts such as rank, rating, form, win/loss outcome, match status, and event progress. Routine metadata should remain calm.

### 4.5 Progressive migration

The existing AppKit-derived layer will be reduced incrementally. New work must use the shared design system. Legacy classes may remain temporarily only where replacing them would create unrelated risk.

## 5. Visual foundation

### 5.1 Spacing

Use a shared 4-point spacing scale:

- `4px`: tightly related icon/text details;
- `8px`: compact internal gaps;
- `12px`: row and control gaps;
- `16px`: default page gutter and card padding;
- `20px`: roomy component separation;
- `24px`: standard section separation;
- `32px`: major content-group separation.

Screen rules:

- default horizontal page gutter: `16px`;
- compact devices may use `12px` only where necessary;
- primary sections: `24px` apart;
- section header to content: `12px`;
- card internal padding: normally `16px`;
- list rows use one shared vertical rhythm;
- fixed headers and bottom navigation must account for safe-area insets.

No screen should introduce arbitrary margins where an existing token applies.

### 5.2 Typography

Use the native system font stack already present. Define semantic roles rather than per-screen font sizes:

- app/page title;
- hero identity title;
- section title;
- list-row title;
- body text;
- secondary text;
- label/eyebrow;
- metric value;
- numeric tabular value.

Player names, event names, ranking values, and scores may use stronger hierarchy. Supporting metadata must remain readable and should not be made faint merely to look minimal.

Use tabular numerals for ratings, rankings, scores, percentages, and records where alignment matters.

### 5.3 Colour

Retain the existing brand palette and semantic outcome colours.

Colour roles must be tokenised:

- app background;
- primary surface;
- raised/strong surface;
- subtle tinted surface;
- primary and muted text;
- border/hairline;
- brand accent;
- brand secondary accent;
- success/win;
- danger/loss;
- warning/draw or caution;
- information;
- focus ring.

Colour should communicate meaning consistently. A win, loss, warning, selected state, or ranking movement must use the same semantics across all screens.

Dark mode must be intentionally designed with adjusted surface contrast and borders, not produced through scattered overrides.

### 5.4 Shape and depth

Use a small radius scale with clear roles:

- small radius for compact controls and list sub-elements;
- medium radius for inputs, segmented controls, and compact cards;
- large radius for principal cards and sheets;
- pill radius for badges and compact actions.

Depth should come mainly from surface contrast and borders. Use subtle shadows only for floating navigation, active overlays, or raised hero surfaces. Avoid stacking multiple shadowed cards.

## 6. Application shell

### 6.1 Headers

All screens should use one header architecture.

Tab roots use a branded root header with:

- one clear title;
- a consistent arrangement of primary and overflow actions;
- optional contextual badge such as selected leagues;
- safe-area-aware height;
- predictable collapsed/sticky behaviour if scrolling requires it.

Detail screens use one detail-header pattern with:

- Back as the primary left action;
- concise title or entity name;
- no duplicate Home action where bottom/tab navigation already provides recovery;
- no more than two visible right-side actions before overflow.

Header controls use a minimum `44px` target and identical icon sizing, pressed feedback, and accessibility labels.

### 6.2 Bottom navigation

Retain the five-tab model. The bottom bar must:

- respect the bottom safe area;
- use consistent icon and label alignment;
- make the active tab obvious without relying on colour alone;
- maintain at least `44px` interactive height per item;
- preserve each tab's navigation and scroll state;
- support reselect-to-root or reselect-to-top consistently;
- avoid content being obscured by the bar.

### 6.3 Page layout

Every page must use the shared shell and content primitives. Raw page wrappers should be migrated unless required for a documented exception.

The page shell owns:

- safe-area offsets;
- header and footer clearance;
- page gutters;
- content maximum behaviour on tablets;
- scroll restoration;
- overlay inertness when a sheet is open.

## 7. Native-mobile interaction rules

### 7.1 Touch and feedback

- all principal actions have at least a `44x44px` target;
- pressed states appear immediately;
- destructive actions are visually and semantically distinct;
- disabled controls remain legible and explain their state when necessary;
- long-running actions show inline progress and prevent accidental duplicate submission;
- hover-only affordances are prohibited.

### 7.2 Navigation and state preservation

- Android system back first dismisses the topmost overlay, then navigates back, then exits only from an application root;
- browser history and app-tab history must remain aligned;
- returning from a detail screen restores the previous list, filter, and scroll position;
- tab switching must not unnecessarily reset loaded data or local UI state;
- deep links must open into the same shared shell as in-app navigation.

### 7.3 Sheets and overlays

Use bottom sheets for mobile actions, filters, installation prompts, confirmations, sharing, and compact forms. Centred dialogs are reserved for cases where a sheet would be unsuitable.

All overlays must support:

- safe-area padding;
- focus trapping and focus return;
- Escape and system-back dismissal where safe;
- backdrop dismissal where safe;
- scroll locking;
- reduced-motion support;
- a consistent handle, title, close action, and action area.

A single overlay-stack owner should prevent multiple independent sheets from conflicting.

### 7.4 Forms and keyboards

- use appropriate input types and `inputMode` values;
- avoid font sizes that trigger iOS zoom;
- keep focused fields visible above the virtual keyboard;
- use clear persistent labels rather than placeholder-only forms;
- provide inline validation close to the relevant field;
- use native controls where custom behaviour adds no value;
- primary submit actions should remain reachable on narrow and short screens.

### 7.5 Motion

Motion should clarify spatial relationships, not decorate routine interactions.

Allowed patterns include:

- sheet entrance/exit;
- restrained page or content-state transitions;
- pressed-state scale or opacity feedback;
- list insertion/loading transitions where layout remains stable;
- subtle ranking or result emphasis.

All motion must respect `prefers-reduced-motion`. Avoid long easing, bouncing, parallax, or continuous animation.

## 8. Shared component system

The design-system package is the canonical component layer. The audit will classify existing components as retain, refine, consolidate, or retire.

### 8.1 Required canonical primitives

- application page shell;
- root and detail headers;
- bottom navigation;
- card and section surfaces;
- hero/entity header;
- button and icon button;
- search field and standard form fields;
- segmented control and filter chips;
- list, list item, grouped list, and progressive-loading footer;
- avatar/entity mark;
- rating/rank/metric presentation;
- outcome and status badges;
- empty, error, loading, offline, and permission states;
- bottom sheet and confirmation sheet;
- skeleton primitives;
- toast or transient feedback where appropriate.

### 8.2 Component rules

Each primitive must define:

- allowed variants and sizes;
- spacing and typography roles;
- focus, hover-capable, pressed, selected, disabled, loading, and error states;
- light and dark appearances;
- accessibility semantics;
- responsive behaviour down to `320px` width;
- whether it is canonical or legacy-compatible.

Screens must not duplicate canonical patterns through local CSS.

## 9. Screen treatment

### 9.1 Home

Preserve the current content structure while improving the visual entry point.

- give the top area a confident but compact sports identity;
- make primary destinations visually distinct without turning them into oversized dashboard tiles;
- present notable ranking/event/player information through selective editorial emphasis;
- keep the path to league selection and current context obvious;
- avoid excessive card nesting.

### 9.2 Player search and favourites

- use one consistent search surface and scope selector;
- clearly separate favourites from results;
- maintain scroll and query state after viewing a player;
- use stable loading rows or skeletons;
- ensure favourite actions do not interfere with row navigation;
- preserve progressive list loading.

### 9.3 Player detail and sub-pages

Player identity should be the strongest visual treatment in the app.

- unify player hero, avatar/initials, rating, rank, record, and favourite action;
- prioritise two to four key metrics rather than a dense tile wall;
- use consistent links into insights, matches, tournaments, and journal;
- standardise section spacing and list rows across all player sub-pages;
- use attractive form/outcome presentation while keeping detailed history easy to scan.

### 9.4 Ratings

- emphasise current rank, player identity, rating, and movement;
- use tabular numbers and stable column alignment;
- avoid desktop-table presentation on narrow phones;
- make filters and scopes accessible through native-feeling controls or sheets;
- preserve infinite/progressive loading and clear end states.

### 9.5 Leagues, teams, and fixtures

- standardise league/team identity headers;
- present standings, fixtures, and result rows through shared sports-list variants;
- keep dates, home/away identity, score, and status hierarchically consistent;
- use chips or secondary text for divisions and competition metadata;
- ensure dense fixture details remain readable on small screens.

### 9.6 Tournaments and event detail

- use a consistent event hero with date, venue/organiser metadata when available, and favourite action;
- visually separate event summary from player/results lists;
- standardise tournament status and stage labels;
- use bottom-sheet filters where selection complexity exceeds a compact segmented control;
- retain automatic page loading with clear retry behaviour.

### 9.7 Head to Head

- keep players A and B visually distinct but equally weighted;
- make selection, comparison, and swap actions native and obvious;
- prioritise headline comparison and recent outcomes;
- avoid overly dashboard-like metric grids;
- use a consistent match-history list shared with other match screens.

### 9.8 About, data coverage, feedback, and utility screens

- use the same shell, section rhythm, cards, and buttons as the primary product;
- avoid these screens looking like legacy web pages;
- present destructive data-reset actions through confirmation sheets;
- display version, source, and coverage information in readable grouped sections;
- keep feedback forms concise and keyboard-safe.

## 10. Loading, empty, error, offline, and success states

Every data-bearing screen must define all relevant states.

### Loading

Use skeletons matching the final layout when prior content is unavailable. Use unobtrusive inline progress when refreshing existing content. Avoid replacing entire screens with spinners.

### Empty

Explain what is absent, why it matters, and the most useful next action. Do not use generic empty illustrations everywhere.

### Error

Use user-readable messages, preserve existing content where possible, and provide a clear retry action. Repeated automatic retries must stop after an error.

### Offline

The shell should make offline status clear without blocking cached content. Actions requiring connectivity should explain the limitation.

### Success

Use inline confirmation or a short toast for completed actions. Avoid unnecessary modal success screens.

## 11. Accessibility

The implementation must preserve or improve:

- semantic headings and landmarks;
- labelled controls and icon buttons;
- visible focus indicators;
- colour contrast in both themes;
- non-colour cues for status and selection;
- screen-reader announcements for loading, errors, and saved actions;
- reduced-motion support;
- logical focus order;
- no interactive element inside another interactive element;
- no hidden interactive controls;
- text scaling without clipping or horizontal overflow.

WCAG 2.2 AA is the target for applicable web/PWA behaviour.

## 12. Technical architecture and migration

### 12.1 Source of truth

`packages/design-system` owns reusable visual primitives. `apps/mobile` owns product-specific composed components such as player heroes or fixture rows only when they encode TT Players domain meaning.

Global tokens should live in one documented layer. App-level CSS may provide product composition but must not redefine primitive geometry or semantic colours.

### 12.2 Legacy containment

Existing AppKit assets remain available during migration. Their usage should be explicitly isolated and must not be copied into new components.

The audit will produce:

- a component inventory;
- duplicated-pattern findings;
- token violations;
- per-screen consistency findings;
- accessibility and native-behaviour findings;
- migration status for each screen.

### 12.3 Change strategy

Prefer a sequence of focused PRs rather than one large visual rewrite:

1. foundations and audit tooling/documentation;
2. shared shell, tokens, headers, navigation, and states;
3. shared cards, lists, controls, sheets, and forms;
4. high-value journeys: Home, Players, Player Detail, Ratings;
5. Leagues, Teams, Fixtures, Tournaments, H2H;
6. utility screens, dark-mode QA, accessibility, and cleanup.

Each PR should leave the app internally consistent and deployable.

## 13. Validation strategy

### 13.1 Automated checks

- TypeScript build and existing mobile tests;
- component tests for canonical states and semantics;
- accessibility checks for rendered primitives and core screens;
- regression tests for navigation/back behaviour, filters, favourites, and progressive loading;
- lint or style checks to prevent new raw legacy classes and non-token spacing where practical.

### 13.2 Device matrix

At minimum, validate:

- `320px` narrow phone;
- common Android width around `360-412px`;
- modern iPhone widths with top and bottom safe areas;
- large phone and small tablet widths;
- portrait and relevant landscape layouts;
- light and dark themes;
- reduced motion;
- text scaling/zoom;
- virtual keyboard open;
- PWA standalone and normal browser modes where available.

### 13.3 Screen review checklist

For every screen verify:

- page gutter and section rhythm;
- title and header consistency;
- safe-area clearance;
- touch targets and pressed feedback;
- typography roles;
- surface/card hierarchy;
- loading, empty, error, and offline states;
- dark mode;
- back and overlay dismissal;
- scroll restoration;
- no horizontal overflow at `320px`;
- no duplicated local implementation of a canonical pattern.

## 14. Success criteria

The polish is successful when:

- users recognise the existing app and workflows immediately;
- all screens appear to belong to one visual and interaction system;
- no major screen feels like a legacy AppKit page beside a modernised screen;
- common spacing, type, colour, cards, buttons, lists, headers, and states are centrally defined;
- the app feels installed and native rather than like a responsive website;
- player, rating, match, and tournament screens feel attractive and distinctly sports-oriented;
- information remains at least as scannable as today;
- Android back, safe areas, sheets, keyboard handling, and scroll restoration behave predictably;
- light and dark modes receive equivalent design quality;
- the app passes the agreed automated checks and device review matrix.

## 15. Non-goals

This project does not include:

- replacing the five-tab information architecture;
- rebranding TT Players;
- rebuilding the application in React Native or another framework;
- separate iOS and Android UI codebases;
- unrelated backend or data-model changes;
- adding decorative complexity solely to make screens look different;
- rewriting all existing CSS in one change;
- changing successful workflows without a documented usability reason.

## 16. Implementation decision summary

Proceed with a **system-first evolutionary polish**:

- preserve the current 70% that works;
- establish final tokens and canonical primitives;
- modernise remaining legacy patterns incrementally;
- prioritise native behaviour and consistency;
- add attractive sports emphasis selectively;
- deliver through reviewable, independently deployable PRs.
