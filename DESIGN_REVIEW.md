# TT Players Mobile — Full Design & UX Review

A screen-by-screen and component-by-component audit of `apps/mobile` (all 6 tab screens, all 7 detail/sub pages,
every shared component, the `packages/design-system` package, and the 3,668-line stylesheet).

Issues are grouped by theme. Each item has **What's wrong** (with evidence) and **How to fix**.
A prioritised rollout plan is at the end (§14).

> Cross-references like §3.2 point to other items in this doc.

## Implementation status — 2026-06-22 (updated)

### Pass 1 (completed)

- Single `TAB_METADATA` source for footer, menu, page titles, and home nav cards (§1.5).
- Removed duplicated player-favourite state handling from `App.tsx` and `PlayerPage.tsx` by using `useFavouritePlayers` (§1.1).
- Shared tournament aggregation + number/win-rate helpers in `player-shared.ts` (§1.3, §11).
- Removed artificial boot delay, console logging, dead transform code, duplicate scroll listener, and dead hero CSS (§1.7, §13.4, §13.11).
- Rewrote About screen onto themed cards/buttons and replaced native `window.confirm()` with an in-app confirmation sheet (§7.4, §8.10).
- Improved heading hierarchy on tab-root content and player sub-list pages (§10.6).
- Unified H2H search debounce onto `useDebouncedValue` (§4.2).
- Fixed share-menu class typo, image alt text, external-link rels, loss colour consistency, focus-visible, tap targets, and reduced-motion basics (§8.6, §8.12, §10).

### Pass 2 (2026-06-22)

- Created `useFavouriteH2H` and `useFavouriteTournaments` hooks; migrated H2HTabContent, EventsTabContent, EventDetailPage from inline copies (§1.1).
- Extracted `useSubmitFeedback` hook; migrated AboutTabContent and QuickFeedbackSheet from duplicate submission logic (§1.2).
- Deleted `usePageNavigation`; migrated all 5 consumers directly to `useTabNavigation` (§1.4).
- Removed `aria-hidden` + `tabIndex={-1}` from slide-in header (§2.3).
- Replaced duplicate theme checkbox+anchor in menu with single `role="switch" aria-checked` row (§2.5).
- Fixed inconsistent theme icons in page-title bar (lightbulb → sun) (§2.1).
- Added `role="search"` to `AppSearchInput`, `AppSearchBox`, and all search panels (§4.3).
- Fixed `SegmentedToggle` className concatenation handling (§13.11k).
- Created shared `SectionHeader`, `EmptyState`, and `ErrorState` components (§8.2, §9.4).
- Added `aria-live="polite"` / `role="alert"` to feedback success/error states (§10.8).
- Made H2H A/B cards visually distinct (A=accent fill, B=accent outline) (§8.8).
- Fixed H2H VS badge from absolute positioning to grid column (avoids overlap on ≤360px) (§13.11f).
- Removed render-blocking Google Fonts import; dropped Inter from font stack (§13.11a).
- Changed "General" round fallback to "Other matches" (§13.11d).
- Made "Last 10" label dynamic (§13.11c).
- Removed dead `favourites-scroll` class references (§13.7).
- Fixed `tt-icon-loss` from warning to danger for colour consistency (§8.6).
- Added `@media (hover: hover)` guard for all hover styles (§13.10).
- Extended `@media (prefers-reduced-motion: reduce)` coverage (§13.9).

### Pass 3 (2026-06-22)

- Created `DetailHeader` component; migrated all 7 detail pages (PlayerPage, FixturePage, TeamPage, EventDetailPage, PlayerInsightsPage, PlayerMatchesPage, PlayerTournamentsPage) from duplicated `AppHeader` + back/home actions (§2.2, §2.6).
- App.tsx now uses `<AppPageContent>` instead of raw `<main>` (§13.8).
- Created `Pill` component in design-system (§8.13).
- Created `OutcomeBadge` component in design-system (unified win/loss/draw: success/danger/warning) (§8.5).
- Created `ExternalLinkButton` in design-system (§12.3).
- Created `FavouriteButton` component in mobile app (§8.7).
- Created `useQueryError` hook for user-friendly error mapping (§9.3).
- Added CSS tokens: `--ink-strong`, `--surface-subtle`, `--surface-subtle-strong`, `--radius-sm/md/lg/pill`, `--space-section` (§8.11).
- Bumped `--ink-muted` alpha from 0.6 → 0.68 for WCAG AA contrast on small text (§10.4).
- Added Pill CSS, FavouriteButton CSS, OutcomeBadge CSS, `tt-icon-danger`/`tt-icon-warning` icon classes, `tt-form-result-draw` pill.
- Replaced `tt-rubber-type-badge` `rgba()` backgrounds with `--surface-subtle` token (§13.11l).
- Fixed `AppMessageCard` action button to full-width (§13.11g).
- Converted HomeTabContent nav items and leaders rows from `<a href="#">` to `<button>` (§10.2).
- Converted LeaguesTabContent standings rows from `<a href="#">` to `<button>` (§10.2).
- Converted EventsTabContent "Load More" from raw `<a>` to `<AppButton>` (§5, §10.2).
- Fixed `EventDetailPage.tsx` missing `useState` import.
- Fixed `AboutTabContent.tsx` and `QuickFeedbackSheet.tsx` duplicate `FeedbackType` definitions.

### Pass 4 (2026-06-23)

- Removed the still-present render-blocking Google Fonts `@import`; body now uses the native/system font stack only (§13.11a).
- Fixed the remaining dark-mode icon mismatch: page-title and compact header now both use sun/moon (§2.1).
- Corrected theme switch semantics from `aria-pressed` to `role="switch" aria-checked` for the remaining theme controls (§2.5).
- Migrated PWA install and reload prompts from raw AppKit menu shells, inline z-indexes, and raw `btn` classes to the shared `BottomSheet` + `AppButton` primitives (§7, §5).
- Removed the unused duplicate `usePWAInstall` hook; `PWAInstallContext` is now the single PWA install prompt owner.
- Migrated About clear-data confirmation onto shared `BottomSheet`; removed the hand-rolled confirm backdrop/sheet and inline dialog styles (§7.4, §8.10).
- Added PWA install and feedback sheet handling to system back navigation; Android/back now dismisses these overlays before tab navigation (§7.3).
- Removed the duplicate document scroll listener; header scroll state is driven by the single window listener (§13.11j).
- Converted design-system `MoreButton` and `AppTabBar` action primitives away from fake `href="#"` anchors to real buttons; fixture rubber player actions are buttons too (§10.2).

### Pass 5 (2026-06-23)

- Added `packages/design-system/README.md` with explicit module boundaries, legacy compatibility notes, and reuse rules.
- Removed fake `href="#"` action anchors from the design-system package: `AppShell`, `AppSidebar`, `AppList`, `AppPlayerList`, `ListItem`, and `AppButtonLink` no longer emit hash links for actions (§10.2).
- Consolidated duplicate W/L/D exports: `OutcomeBadge` now exports from `components/OutcomeBadge.tsx`; `Actions.tsx` only owns action/link primitives (§8.5).
- Made `AppPlayerList` generic instead of using an `any` index signature, preserving typed trailing/select payloads for legacy consumers (§13.11h).
- Hardened `ThemeContext` with DOM/storage guards so the theme module is reusable outside the current browser-only mobile shell (§1.6).
- Added button reset styles for design-system components that now render semantic buttons.

Remaining larger refactors: unified header, full `AppButton` migration, full overlay-stack integration across every overlay type, remaining app-level fake-action anchors, stronger typing for lingering app-screen `any`, and localStorage ownership consolidation.

---

## 1. Duplication & Architecture (do first — unblocks everything else)

### 1.1 Favourite state logic is implemented 4 times
`useFavouritePlayers.ts` is a complete, correct hook — but it is **imported nowhere**. The identical
parse / persist / storage-event-sync logic is re-implemented inline in:

- `App.tsx` (own `FAVOURITES_STORAGE_KEY`, `parseStoredFavouritePlayers`, `persistFavouritePlayers`)
- `PlayerPage.tsx` (own copy)
- `H2HTabContent.tsx` (own copy for H2H favourites, key `tt_players_favourite_h2h`)
- `EventsTabContent.tsx` + `EventDetailPage.tsx` (own copy for tournaments)

`App.tsx` even redeclares `FAVOURITES_STORAGE_KEY = 'tt_players_favourite_players'` that already exists in
`player-shared.ts`. The storage-event-sync effect (`addEventListener('storage')` + custom event) is copy-pasted
across 5 files (App, EventDetail, EventsTab, H2H, Player — 4 listeners each).

**Fix:** Promote `useFavouritePlayers` into a generic `useLocalStorageList<T>(key, isValid)` + typed siblings
`useFavouritePlayers()` / `useFavouriteH2H()` / `useFavouriteTournaments()`. Delete every inline copy (~250 LOC).

### 1.2 Two feedback forms with duplicated logic
`AboutTabContent.tsx` (full form) and `QuickFeedbackSheet.tsx` (quick form) POST to the same `/feedback`
endpoint with copy-pasted submit/success/error handling and the same `SegmentedToggle`.

**Fix:** Extract `<FeedbackForm variant="quick" | "full" onSubmit>` + `useSubmitFeedback()` hook. Both screens
render it. Removes ~120 duplicated lines and guarantees identical validation/success UX.

### 1.3 Tournament aggregation duplicated verbatim
The "group tournament matches by `event_id` and count wins" `useMemo` block is byte-for-byte identical in
`PlayerPage.tsx` (`tournamentsPlayed`) and `PlayerTournamentsPage.tsx` (`tournaments`).

**Fix:** Move to `player-shared.ts` as `groupTournamentMatches(matches): TournamentSummary[]` or a
`usePlayerTournamentSummary(playerId)` hook.

### 1.4 Two navigation hooks used inconsistently
`useTabNavigation` (the real context) and `usePageNavigation` (a thin wrapper) coexist. Pages split:

- Direct `useTabNavigation`: App, PlayerPage, PlayerInsightsPage, PlayerMatchesPage, PlayerTournamentsPage, LeaguesTabContent, HomeTabContent, TabFooterBar
- `usePageNavigation`: TeamPage, FixturePage, EventDetailPage, EventsTabContent, H2HTabContent

The wrapper adds nothing the context doesn't already expose.

**Fix:** Delete `usePageNavigation`. Move its tiny `goBack`/`goHome` factories into `useTabNavigation` or a
small `useHeaderActions()` helper, migrate the 5 consumers.

### 1.5 Tab metadata is declared **3 times** with conflicting labels and icons
There is no single source of truth for "what the app's tabs are":

| Source | home | players | leagues | events | h2h |
|---|---|---|---|---|---|
| `tabTitles` (App.tsx header) | **TTLive** | Players | Leagues | Tournaments | **H2H** |
| `TabFooterBar` footerItems | **Home** | Players | Leagues | Tournaments | **H2H** |
| Main menu (App.tsx) | **Home** | Players | Leagues | Tournaments | **Head to Head** |
| `HomeTabContent` navItems | — | Players (icon `fa-search`) | Leagues | Tournaments | **Head to Head** |

So the Home tab is labelled **"TTLive"** in its page title but **"Home"** everywhere else; H2H is **"H2H"** in
the footer but **"Head to Head"** in the menu, the home nav card, and its own screen eyebrow. The Players tab
uses icon `fa-user-friends` in the footer/menu but `fa-search` in the home nav card. `APP_TABS` in
`tab-navigation.tsx` only holds ids, so it can't help.

**Fix:** One `TAB_METADATA: Record<AppTabId, { label, shortLabel, icon, description }>` in `player-shared.ts`
(or `tab-navigation.tsx`). Footer, menu, page-title, and home nav card all read from it. Pick final names
(recommend `Home` + `Head to Head` everywhere; drop "TTLive") and one icon per tab.

### 1.6 Theme boot logic duplicated
`main.tsx` reads `TTPlayers-Theme` and sets the `body` class **before** React renders (good — prevents FOUC).
`ThemeContext.tsx` then does the same work again in a `useEffect` on mount. `App.tsx` reads `useTheme().isDarkMode`
for its checkbox state. Three places own one truth.

**Fix:** `main.tsx` is the sole bootstrap; `ThemeContext` only manages *changes* (drop the re-read on mount,
just initialise `isDarkMode` from the body class that main.tsx already set).

### 1.7 `console.log` left in production code
- `PWAInstallContext.tsx:64` — `console.log('User response to the install prompt: …')`
- `PWAReloadPrompt.tsx:10,13` — `'SW Registered'`, `'SW registration error'`

**Fix:** Remove, or route through a `logger` that's a no-op in production.

---

## 2. Header / Top-bar system (the highest-impact visual problem)

### 2.1 Tab screens render TWO header bars with conflicting actions
On every tab root `App.tsx` renders **both**:

1. `.page-title-fixed` — always visible: title + feedback + share + filter + theme + menu icons.
2. `.header-auto-show` — slides in after 40px scroll: title + menu + filter + feedback + theme icons.

They duplicate every action but use **inconsistent iconography for the same function**:

| Action | `.page-title` icon | `.header-auto-show` icon |
|---|---|---|
| Theme (light) | `fa-moon` | `fa-moon` |
| Theme (dark) | `fa-lightbulb` | `fa-sun` |

Toggling theme shows a lightbulb in one bar and a sun in the other.

**Fix:** Pick ONE header. Either keep `.header-fixed` only (like the detail pages use `AppHeader`), drop
`.page-title`; or make `.page-title` a large hero that collapses into a compact sticky bar (single element, two
states). Use one icon pair for theme (`fa-moon`/`fa-sun` + `aria-pressed`).

### 2.2 Detail pages use a *different* header component
`PlayerPage`, `TeamPage`, `FixturePage`, `EventDetailPage`, `PlayerInsights/Matches/TournamentsPage` use
`<AppHeader>`. Tab roots in `App.tsx` use hand-rolled raw `<header>` markup. Two implementations, two styling
sources, two a11y behaviours.

**Fix:** Drive **all** screens through `<AppHeader>` (extend it with `rightActions[]` + badge support for the
filter count). Delete the raw `<header>` in `App.tsx`.

### 2.3 Interactive header is hidden from assistive tech
`App.tsx:537` puts `aria-hidden="true"` on the `.header-auto-show` `<header>` even though it contains 6 clickable
`<a>` controls (also `tabIndex={-1}`). Screen-reader and keyboard users cannot reach menu/filter/feedback/theme.

**Fix:** Never `aria-hidden` a container with interactive children. Remove `aria-hidden` + `tabIndex={-1}`;
hide visually with `opacity`/`transform` + `pointer-events:none` when collapsed.

### 2.4 "About" is a ghost tab
`APP_TABS` includes `about` and the route exists, but `TabFooterBar` only lists 5 items. About is reachable only
via the hamburger menu, and when active **no footer item highlights**.

**Fix:** Either add About to the footer, or remove `about` from `APP_TABS` and make it a menu-only destination
(cleaner). Don't leave it half-in/half-out.

### 2.5 Theme toggle has 3 controls and no state semantics
The "Dark Mode" menu row has BOTH an `<a onClick={toggleTheme}>` AND a `<input type="checkbox" readOnly>` switch
for the same action. Plus the page-title/header bars each have their own toggle anchor. No `role="switch"`, no
`aria-pressed`, no `aria-label` describing current state.

**Fix:** Single `useTheme().isDarkMode` source. Render one `<AppSwitch checked={isDarkMode} onChange=…>` or one
`aria-pressed` button. Kill the duplicate checkbox+anchor pair.

### 2.6 Back/Home header actions duplicated across 6 pages
Every detail page re-declares the same `leftAction`/`rightAction` objects:
```tsx
leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
```
…plus its own `goBack`/`goHome` factory (see §1.4).

**Fix:** A `<DetailHeader title backPath>` preset that wires both actions via `useTabNavigation`. 6 pages → 6
one-liners.

---

## 3. Lists — 3 primitives exist, 7+ screens ignore them

### 3.1 The evidence
You ship **two** list components in `packages/design-system`:

| Component | Renders | Used by |
|---|---|---|
| `AppPlayerList` (+ local `PlayerList`) | avatar + name + subtitle + trailing, grid | Players search, Player search sheet, Favourites, Team roster, H2H matchups |
| `AppListGroup` + `AppListItem` | icon + title + subtitle + trailing, `<a>`/`<div>` | Player seasons/matches, Events list, Event players, Insights rivals, Tournaments |

But **7+ other list surfaces are hand-rolled**, each with its own JSX and CSS class:

| Screen | List class | Layout |
|---|---|---|
| Home leaders | `tt-home-leaders-row` | rank · name · stat · rate-badge |
| Leagues — active leagues | `tt-league-list-row` | icon-circle · copy · status-pill |
| Leagues — divisions | `tt-league-summary-row-button tt-league-division-option` | copy · status-pill |
| Leagues — standings | **reuses** `tt-home-leaders-row` (rate-slot = points, stat-slot = W/D/L) | same as Home |
| League picker sheet | `tt-league-picker-row` + `-check` + `-content` | checkbox · copy |
| Event — top players | `tt-event-top-player-grid` → `tt-event-top-player-card` | 3-col **grid** |
| Event — match results | `tt-event-match-row` (via `AppListItem` with `title={<span>…</span>}` hack) | stretched title |
| Fixture rubbers | `tt-rubber-item` + `tt-rubber-scorecard` | home · score-pill · away |

That's **13 distinct `tt-*-row/card/item` CSS classes** in `app-shell.css`.

### 3.2 Why it hurts UX
- **Row heights** diverge silently: `tt-players-row`=68px, `tt-home-leaders-row`≈48px, `tt-league-list-row`=64px,
  `tt-league-picker-row`=58px, `tt-app-list-row`=74px. Rhythm shifts between every screen.
- **Leading slot**: avatar circle vs icon circle vs rank chip vs checkbox vs letter icon — five different shapes.
- **Trailing slot**: chevron vs rate-badge vs status-pill vs Remove button vs score-pill — no shared slot.
- **Hover/active feedback**: leaders + players rows have it; picker only on `.selected`; event cards have none.
- **Dividers**: some use `border-bottom` + `:last-child` reset; grid cards use gaps. Inconsistent hairlines.
- **Standings abuse**: Leagues tab reuses `tt-home-leaders-row`, so "rate" shows *points* and "stat" shows
  W/D/L — the same component means two different things.

### 3.3 Fix
Collapse into one primitive with slots:
```tsx
<List variant="row"|"card"|"grid" size="sm"|"md"|"lg" divider="hairline"|"gap"|"none" selectable>
  <ListItem
    leading={<Avatar/>|<RankBadge/>|<IconCircle/>|<Checkbox/>}
    title subtitle
    trailing="auto"|<StatusPill/>|<ScorePill/>|<FavouriteButton/>|null
    onClick
  />
</List>
```
Avatar, rank chip, icon circle, checkbox, score pill all become small `leading` slot components. Migrate the 7
surfaces; delete `tt-home-leaders-row`, `tt-league-list-row`, `tt-league-picker-row`, `tt-event-top-player-card`,
`tt-app-list-row` (~400–500 LOC of CSS). Fixture rubber rows are genuinely 2-D and can stay custom — document why.

---

## 4. Search — 5 surfaces, almost every dimension differs

### 4.1 The 5 surfaces
1. **Players tab** (`App.tsx`) — server search
2. **Tournaments tab** (`EventsTabContent.tsx`) — server search
3. **H2H player picker** (`PlayerSearchSheet.tsx`) — server search in a sheet
4. **Event detail → players** (`EventDetailPage.tsx`) — client filter
5. **League picker** (`LeagueSelectionPage.tsx`) — client filter, 3 tabs

### 4.2 Where they diverge

| Dimension | Players | Tournaments | H2H sheet | Event filter | League picker |
|---|---|---|---|---|---|
| Container | `tt-players-search-panel` + custom `<label>` input | `tt-players-search-panel` + `AppSearchInput` | `search-box search-dark rounded-pill` (AppKit) | bare `AppSearchInput` in a section | `search-box search-dark rounded-pill` (AppKit) |
| Min length | **3 chars** | **none** (fires on 1 char) | **3 chars** | none (client) | none (client) |
| Debounce | 250ms via `useDebouncedValue` | 250ms via `useDebouncedValue` | 250ms **hand-rolled** (`setTimeout`+`useState`) | instant | instant |
| Loading copy | `<spinner> Loading players...` | `Loading` header note + skeleton | `Searching players...` (animated `…`) | (none) | `Loading leagues...` (animated `…`) |
| Empty copy | `No players found matching "X"` | `AppMessageCard`: `No tournaments found matching "X"` | `No players found matching "X"` | `No players match this search.` | `No leagues match "X"` / `No regions match your search.` |
| Error | `Failed to load players: {raw err}` | `AppMessageCard` w/ retry | `{err}` raw | (none) | `Failed to load leagues` |
| Results list | `PlayerList` large | `AppListItem` | `PlayerList` compact | `AppListItem` | hand-rolled `tt-league-picker-row` (see §3) |
| Pagination | none | "Load More" button (manual) | none | n/a | n/a |
| Scope control | custom `tt-players-search-scope-toggle` | none | none | none | custom `tt-picker-tabs` |

You already ship `AppSearchInput` (panel-style) **and** `AppSearchBox` (pill-style) in the design system — and
then use both inconsistently.

### 4.3 Fix
Two pieces:
- **`<SearchPanel variant="panel"|"pill" eyebrow title placeholder scope? minLength? loading error empty>`** — owns
  the input, optional `SegmentedToggle` scope, and **all four** state rows (too-short / loading / error / empty)
  with shared copy + `aria-live`. Delete `tt-players-search-scope-toggle` and `tt-picker-tabs`.
- **`useSearch({ minLength, debounceMs, enabled })`** hook returning `{ query, debouncedQuery, isReady, isTooShort }`.
  Replaces the hand-rolled H2H debounce, the `isSearchMode`/`isShortSearchQuery` flags in App.tsx, and the
  `isSearchActive = query.trim().length > 0` checks in EventsTabContent. Enforces "3-char min for server,
  none for client" so Tournaments stops hammering the API.

Bonus: one place to add `role="search"`, a clear (×) button (currently **zero** surfaces have one), and
`aria-live` announcements.

---

## 5. Buttons — `AppButton` is unused; 8 different "primary" CTAs

### 5.1 Four button mechanisms coexist
- `AppButton` (design-system, actual `<button>`) — **0 usages**. Built and never adopted.
- `AppButtonLink` (anchor styled as button) — 5 files.
- Raw `<button type="button">` with bespoke classes — HomeTabContent, QuickFeedbackSheet, AboutTabContent,
  PlayerSearchSheet, LeagueSelectionPage, EventsTabContent, App.tsx.
- Raw AppKit `btn` classes (`className="btn btn-m …"`) — AboutTabContent (3), EventsTabContent (Load More),
  PWAInstallSheet (3), PWAReloadPrompt (1).

### 5.2 Eight distinct CTA class names for "the primary action"
`tt-player-action-pill` · `tt-home-onboarding-button` · `tt-feedback-primary` · `tt-leagues-toggle-button` ·
`tt-player-full-list-button` · `tt-clear-action-button` · `tt-favourite-action-button` · raw `btn bg-highlight`.
Each has its own height, padding, radius, and font-weight.

### 5.3 "View All / Load More" looks different everywhere
- PlayerPage: "View All Tournaments" + "View Full Match List" → `AppButtonLink full tt-player-full-list-button`
- Events tab: "Load More Tournaments" → raw `<a class="btn btn-sm btn-full btn-border border-highlight …">`
- PlayerMatches: "Load More Matches" → `AppButtonLink` that flips tone while loading

### 5.4 Fix
Adopt `AppButton` everywhere; delete `AppButtonLink` (or make it the only escape hatch for true links). One set
of tones (`highlight` / `outline` / `ghost` / `danger`) and sizes (`sm`/`md`/`lg` + `full`). One `<MoreButton
loading hasMore onClick>` for pagination. Kill the 8 CTA classes.

---

## 6. Segmented controls — 3 implementations of the same widget

| Surface | Implementation |
|---|---|
| Home leaders, Player season, About/Quick feedback type | `<SegmentedToggle>` → `tt-segmented-toggle` (the right one) |
| Players tab search scope | hand-rolled `tt-players-search-scope-toggle` |
| League picker tabs (Selected/Leagues/Areas) | hand-rolled `tt-picker-tabs` |
| CSS also defines `tt-tab-toggle` and `tt-chip` as further variants | not always used |

Five CSS classes for "a row of mutually-exclusive pills".

**Fix:** One `<SegmentedToggle variant="pill"|"tab"|"chip" size>` in the design system. Migrate the two
hand-rolled surfaces; delete `tt-players-search-scope-toggle` and `tt-picker-tabs`.

---

## 7. Sheets / Overlays — 4 different shells, no shared backdrop or a11y

### 7.1 Four sheet structures
- `tt-picker-shell` + `tt-picker-top` — `LeagueSelectionPage`, `PlayerSearchSheet`
- `tt-feedback-shell` + `tt-feedback-header` — `QuickFeedbackSheet`
- raw `.menu .content` — `PWAInstallSheet`, `PWAReloadPrompt`, App's `menu-share`
- AppKit left drawer — App's `menu-main`

Each hand-rolls its own backdrop (`<div className="menu-hider menu-active" style={{zIndex:998}}/>`) and
`zIndex:999`. Close affordance is inconsistent: `fa-times` (menu-main), `fa-times-circle font-20` (sheets),
`close-menu` class (menu-share).

### 7.2 No dialog semantics, no focus management
None of the sheets have `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, or a focus trap. Backdrop click
closes but Tab can escape behind them. Only `App.tsx` handles Escape — and only for menu + league picker, not
for the sheets.

### 7.3 Hardware back button doesn't know about sheets
`onSystemBackPressed` (App.tsx) handles menu → league selector → tab back, but `PlayerSearchSheet`,
`QuickFeedbackSheet`, install and reload sheets are **not** in that chain — Android back dismisses the wrong
overlay or exits.

### 7.4 `window.confirm()` native dialog
`AboutTabContent.tsx:18` uses `window.confirm()` for "Clear Saved Data" — jarring, unstyleable, breaks design.

### 7.5 Fix
One `<BottomSheet isOpen onClose height title>` and one `<Drawer>`/`<Modal>` in the design system. Single shared
backdrop, z-index scale (`--z-backdrop 998` / `--z-sheet 999`), focus trap, Escape-to-close, `role="dialog"`.
Centralise overlays in a `useOverlayStack()` so hardware back pops the top overlay first. Replace `window.confirm`
with a `<ConfirmDialog>` bottom sheet.

---

## 8. Visual consistency

### 8.1 Hero cards duplicated 7 times
`tt-player-hero`, `tt-team-hero`, `tt-fixture-hero`, `tt-insights-hero`, `tt-h2h-panel`, `tt-players-search-panel`,
`tt-leagues-panel`, `tt-tournament-summary` — each independently redeclares the same four rules:
`background: var(--tt-home-surface)` (×7), `border: 1px solid var(--panel-border)` (×6), `border-radius: 18px`
(×7), `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.62)` (×6). Each has its own `-top`/`-copy`/`-divider`
sub-elements.

**Fix:** One `.tt-hero` base + `<HeroCard eyebrow title actions>` component. Removes ~200 LOC of CSS.

### 8.2 Section header pattern repeated 51 times
`<div className="tt-player-section-header"><h2 className="tt-player-section-title">X</h2><span className="tt-player-section-note">Y</span></div>`
appears across **11 files** (51 total usages). Some add a third action child (e.g. standings source link).

**Fix:** `<SectionHeader title note action?>` component.

### 8.3 Eyebrow label: 2 class names, inconsistent copy
`tt-player-eyebrow` (9×) and `tt-picker-eyebrow` (4×) are visually identical. Copy is inconsistent:
"Player profile"/"Team profile" (lowercase p) vs "Players"/"Leagues" (plural noun) vs "Fixture results"/
"Insights Overview"/"Head to Head"/"League Hub"/"League Scope".

**Fix:** One `.tt-eyebrow` class; pick a noun style (recommend singular category: "Player", "Team", "Fixture",
"League", "Tournament", "Head to Head", "Insights", "Feedback").

### 8.4 Five different hero title font sizes
`tt-player-title` 31px · `tt-players-search-title` 31px · `tt-leagues-panel-title` 29px · `tt-team-title` 29px ·
`tt-fixture-title` 27px · `tt-tournament-summary` `clamp(24–28px)`. All are "the big screen title".

**Fix:** One `.tt-hero-title` (31px / -0.03em / 600). Detail pages needing smaller get `.tt-hero-title--sm`.

### 8.5 Win/Loss represented 4 different ways
- PlayerPage matches: `fa-check`/`fa-times` + `tt-match-result-win/loss` (success/warning bg)
- PlayerMatchesPage: `fa-check`/`fa-times` + `tt-icon-win/loss` (accent-subtle bg)
- H2H encounter list: `avatarText='W'/'L'` + `tt-bg-success`/`tt-bg-warning`
- Form pills: `tt-form-result-win/loss` (success/danger)

Same W/L concept → 4 different icon + colour combos. Compounds with §8.6.

**Fix:** One `<OutcomeBadge result="W"|"L"|"D">`. Win=green, Loss=red, Draw=amber — one mapping everywhere.

### 8.6 "Loss" is yellow in some places, red in others
Form pills / H2H encounter pills use `--state-danger` (red) for loss. Match-list icons and the H2H bar use
`--state-warning` (amber). A loss must mean one thing.

**Fix:** Win=`--state-success`, Loss=`--state-danger`, Draw=`--state-warning`. Sweep `tt-match-result-loss`,
`tt-h2h-bar-b`, `tt-bg-warning` → danger. Reserve warning for draws.

### 8.7 Favourite/save control has 3 different shapes
- Players search list: pill "Add"/"Saved" with heart (`tt-player-favourite-icon`)
- Player/Event/H2H hero: pill "Save"/"Saved" (`tt-player-action-pill`)
- Events list: bare heart icon, absolutely positioned, hardcoded `#ff3b30`
- Favourites list "Remove": outlined text badge

**Fix:** One `<FavouriteButton saved onToggle size="sm"|"icon">`. Same icon, label, colours, ≥44pt hit target.
Remove reuses the same component or a shared `<RemoveBadge>`.

### 8.8 H2H "Player A" vs "Player B" cards are visually identical when selected
`-selected-a` and `-selected-b` are defined identically (both `--accent`). Once both players are picked you
can't tell sides apart without reading text. The `.tt-h2h-bar-a/-b` split also reuses success/danger colours
that clash with win/loss semantics (§8.6).

**Fix:** Distinct but harmonious A/B treatments (A = accent fill, B = accent outline; or A/B letter badges).

### 8.9 Avatar treatment differs across screens
- Player/Insights hero: solid accent circle, white initials, 72px.
- `AppPlayerList` default: `bg-highlight` initials.
- H2H selected avatar: white-on-transparent, 48px, bordered.
- Event top-player "rank": accent-subtle circle with a number.

**Fix:** One `<Avatar size initials color variant>` (extend design-system). Documented variants: hero `lg accent`,
list `md subtle|deterministic`, on-accent `onAccent`.

### 8.10 `AboutTabContent` ignores the entire design system
~33 inline `style={{}}`, hardcoded hex (`#4caf50`, `#f44336`, `#dc3545`, `#fff`, `rgba(255,255,255,0.08)`),
raw `<div className="card card-style">` instead of `<AppCard>`, hand-rolled inputs, platform chips that are
**invisible on the light theme** (`rgba(255,255,255,0.08)`). It is also the only screen wrapped in
`maxWidth: 600px; margin: 0 auto` (inconsistent with every other full-bleed screen).

**Fix:** Rewrite with `AppCard` / `AppMessageCard` / shared input components, `SegmentedToggle`, and CSS vars.
Move all styling into `app-shell.css` under `.tt-about-*`. Single most visually inconsistent screen.

### 8.11 Ad-hoc spacing, radius, and `rgba()` → forces ~35 dark-mode override pairs
Section gaps are `margin-top:16px` on `.tt-player-section`, **plus** `mt-2`/`mt-3`/`mb-4` sprinkled on top
(H2H sections double up: base 16 + `mt-2` = 24px). Border-radius is hand-written per class (18/16/12/8/999).
Hardcoded backgrounds like `rgba(31,31,31,0.03)`, `rgba(0,0,0,0.08)`, `rgba(15,23,42,0.05)` each need a matching
`body.theme-dark .x { background: rgba(255,255,255,…) }` — ~35 such pairs exist.

**Fix:** Tokens: `--radius-sm 8/-md 12/-lg 18/-pill 999`, `--space-section 16px`, `--surface-subtle` +
`--surface-subtle-strong` (light + dark). Audit and replace magic numbers; remove redundant `mt-*` on sections.

### 8.12 Share menu has a broken CSS class (typo)
`App.tsx` (5 icons): `className="… color-whiterounded-s"` — not a class. Should be `color-white rounded-s`.

**Fix:** `color-white rounded-s`.

### 8.13 Status pills: 6 variants for "small labelled pill"
`tt-league-list-status` · `tt-league-division-status` · `tt-player-remove-badge` · `tt-rubber-type-badge` ·
`tt-picker-tab-badge` · `tt-page-league-count` · `tt-form-result-pill`.

**Fix:** One `<Pill tone="accent|neutral|success|danger|warning" size="sm"|"xs">`.

---

## 9. Loading, Empty & Error states (three treatments each)

### 9.1 Loading — four treatments
Plain `<p>Loading…</p>` (H2H, PlayerMatches), spinner text, animated `…` dots (`tt-home-leaders-loading`,
`tt-picker-loading`), and skeleton blocks. Some screens have skeletons (Player, Team, Event, Fixture), others
don't (H2H, Leaders text, Events hybrid).

### 9.2 Empty — bare `<p>` sentences, no CTAs
~20 distinct phrasings of "no X found": `No players found matching "X"`, `No matches available for this player.`,
`No players found for this team yet.`, `No data available for the selected leagues.`, `Not enough history yet.`,
`No recent league matches found.`, `No encounters found across all events.`, `No active-season clubs found.`, etc.
Only Home and Players have a real empty/onboarding card with a CTA.

### 9.3 Error — three treatments + raw exceptions leaked
`tt-player-section-error` red text inline; `AppMessageCard` on detail pages; raw red `<div>` in About. **And**
raw exception strings are shown to users: `Failed to load players: {searchError}`, `Failed to load standings:
{standingsError}`, `Failed to load H2H: {h2hError}` — users see `HTTP 500`. The `instanceof Error ? err.message
: null` pattern is copy-pasted **26 times**.

### 9.4 Fix
- `<Skeleton>` everywhere data loads (you have `SkeletonBlock`/`SkeletonList`/`SectionSkeleton` — adopt on H2H,
  Leaders, Events list).
- `<EmptyState icon title message cta>` (reuse the Home onboarding card markup).
- `<ErrorState title message onRetry>` (extend `AppMessageCard` with `tone="danger"` + retry). Map known errors
  to friendly copy; log raw server messages — never show `HTTP {status}`.
- A `useQueryError(error)` helper returning a friendly `{ title, message }` to kill the 26 copies.

---

## 10. Accessibility (a11y)

### 10.1 Interactive elements hidden / untabbable
See §2.3 — `aria-hidden` + `tabIndex={-1}` on the slide-in header.

### 10.2 Buttons are anchors
Virtually every action is `<a href="#" onClick>` (footer tabs, menu items, list rows, toggles). Semantically
wrong, noisy in screen-reader link lists, creates history entries.

**Fix:** `<button type="button">` for actions; reserve `<a href>` for real navigation.

### 10.3 No visible focus styles on most controls
Only 5 selectors define `:focus-visible` (`card-style`, `tt-league-division-option`, `tt-league-tile`,
`tt-standings-row`, and one more). Custom buttons (`tt-feedback-primary`, `tt-player-favourite-icon`,
`tt-home-onboarding-button`, scope toggles, etc.) have none.

**Fix:** Global `:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }` + per-component
checks.

### 10.4 Contrast risk on muted micro-copy
`--ink-muted` is `oklch(21% … / 0.6)` used at **11–12px** for `tt-player-metric-label`, `tt-standings-table th`,
`tt-league-tile-meta`, `tt-form-recent-label`, etc. 60% alpha over parchment at 11px likely fails WCAG AA (4.5:1).

**Fix:** Bump muted text alpha to ~0.68–0.72 for ≤13px, or introduce `--ink-muted-strong` for small text.

### 10.5 Sheets lack dialog semantics + focus trap
See §7.2.

### 10.6 Heading hierarchy is broken
- `HomeTabContent`, `PlayerMatchesPage`, `PlayerTournamentsPage` have **no `<h1>`** (jump straight to `<h2>`).
- `LeagueSelectionPage`, `PlayerSearchSheet`, `QuickFeedbackSheet`, `PWAInstallSheet`, `PWAReloadPrompt` use
  `<h4>` as their title (skip h1–h3).

**Fix:** Every screen/sheet has exactly one `<h1>` (the page title); sections are `<h2>`; subsections `<h3>`.

### 10.7 Decorative `<img alt="img">`
PWA install sheets: `<img … alt="img">` (×2). Non-descriptive alt.

**Fix:** `alt=""` (decorative) — the heading already says "TT Players".

### 10.8 Status messages aren't announced
"Feedback sent" success, "Failed to load" errors — no `aria-live`. `AppLoadingCard` is the only place using
`role="status"`.

**Fix:** Wrap success/error toasts in `aria-live="polite"` / `role="alert"`.

### 10.9 Tap targets below 44pt (Apple HIG minimum)
`min-height` values found: 28, 30, 32, 36, 38, 40, 42 — all below 44px. Culprits: `tt-players-search-scope-toggle`
buttons (28), `tt-player-remove-badge` (30), `tt-h2h-scope-pill` (32), `tt-rubber-type-badge`, `tt-chip`,
`tt-tab-toggle button`, etc.

**Fix:** Enforce `--tap-min: 44px` on every interactive control.

---

## 11. Date / number formatting — 3 formatters + inline copies

### 11.1 Three date functions that overlap
- `formatMatchDate(value)` → `dd Mon yyyy`
- `formatDate(value, { includeTime? })` → `dd Mon yyyy` (+ `HH:mm` if requested)
- `formatIsoDate(value)` → `yyyy-mm-dd`
- Plus `EventDetailPage` inlines `new Date(...).toLocaleTimeString('en-GB', …)` instead of extending `formatDate`.

### 11.2 Win-rate computed inline 4 times
`Math.round((wins / played) * 100)` appears in `PlayerPage`, `H2HTabContent` (×3), `EventDetailPage` — even
though `calcWinRate(wins, played)` already exists in `player-shared.ts`.

### 11.3 Number formatting ad-hoc
`HomeTabContent` has `const fmt = (v) => isCountLoading ? '...' : v !== null ? v.toLocaleString() : '–'`; no
shared thousands/unknown formatter.

### 11.4 Record formats — multiple dialects
`${wins}W · ${losses}L · ${played}P` (Home leaders) vs `${wins}-${losses}` (Event top players) vs
`${wins}-${losses} from ${played}` (tournaments) vs `${playerAWins}-${playerBWins}` (H2H).

**Fix:** One `formatDate(value, opts)` (merge the three), `formatTime`, `formatNumber(v)`, reuse `calcWinRate`,
and one `formatRecord({wins, losses, played?, draws?})` with a single shape.

---

## 12. Metadata & micro-copy inconsistency

### 12.1 Separator character is consistent (`·`) — good — but sentence style isn't
Subtitle lines all use `·` (38 occurrences, zero `•`/`|`), which is great. But the **record/count dialects**
differ (see §11.4) and there's no library of standard fragments.

### 12.2 Eyebrow copy inconsistent — see §8.3.

### 12.3 "Source" / external-link pattern duplicated
`EventDetailPage` and `FixturePage` both render a `tt-league-source-link` (globe icon → external URL). Share
menu + TournaPilot link + source links all use `target="_blank" rel="noreferrer"` but missing `noopener`
(minor; modern browsers imply it from `noreferrer`).

**Fix:** One `<ExternalLinkButton href>` component; always `rel="noopener noreferrer"`.

---

## 13. UX / interaction gaps

### 13.1 No pull-to-refresh on data-heavy lists
Standings, leaders, events, fixtures are refreshable but users must relaunch.

**Fix:** Lightweight pull-to-refresh hook on the main scroll container, or a header refresh button on list screens.

### 13.2 Manual pagination reinvents react-query
`EventsTabContent` and `PlayerMatchesPage` keep local arrays and merge pages by hand with `Set`-based dedup.
react-query (already a dep) has `useInfiniteQuery` for exactly this.

**Fix:** `useInfiniteQuery`; delete the merge effects.

### 13.3 Two parallel queries on Home that can't both be visible
`HomeTabContent` always fires `useLeadersQuery({mode:'combined'})` **and** `useLeadersQuery({mode:'most_played'})`,
then shows one based on the toggle. The hidden mode still costs a request.

**Fix:** `useLeadersQuery({ mode: listMode, … }, { enabled: hasLeagueScope })` — only the visible mode loads.

### 13.4 350ms artificial boot delay
`App.tsx` shows a preloader for a hardcoded 350ms regardless of readiness — pure latency. Skeletons exist.

**Fix:** Remove; show skeletons immediately.

### 13.5 Optimistic UI missing on favourites
Tapping the heart waits for a re-render; no immediate fill animation.

**Fix:** Update local state immediately (already done in most places) + brief scale animation on the icon.

### 13.6 No "scroll to top" on tab roots
Deep links have a back chevron, but tab roots rely on the footer. A user scrolled far down Standings has no
quick way back up.

**Fix:** Tapping the active footer tab already scroll-to-roots (`reselectBehavior="root"`) — surface it with a
visible "scroll to top" affordance when `scrollY > 600`.

### 13.7 `favourites-scroll` class is dead CSS
Referenced in `App.tsx` and `H2HTabContent` but **defined nowhere** — abandoned intent (probably horizontal
scroll). The favourites section renders as a plain block.

**Fix:** Delete the class, or implement the horizontal scroll if that was intended.

### 13.8 Tab roots use a different `<main>` than detail pages
`App.tsx`: `<main className="page-content mt-n1 app-shell-content">` (negative top margin!).
Detail pages: `<AppPageContent>` → `<main className="page-content app-shell-content">` (no `mt-n1`).
So tab content is shifted up; detail pages aren't — different top spacing.

**Fix:** Both use `<AppPageContent>`; remove `mt-n1`.

### 13.9 `prefers-reduced-motion` only partially honoured
Skeleton/loading animations are disabled under reduced motion (good), but sheet slides, hover transforms, and
the `btn:active scale(0.95)` are not.

**Fix:** Wrap all decorative motion in `@media (prefers-reduced-motion: reduce)`.

### 13.10 Hover styles fire on touch (no `@media (hover:hover)` guard)
19 `:hover` rules in `app-shell.css`. On touch devices these trigger on tap-down and "stick" after scrolling,
making rows look permanently hovered.

**Fix:** Wrap hover-only decoration in `@media (hover: hover)`; keep `:active` for touch feedback.

### 13.11 Small but visible polish issues

| # | Location | Issue | Fix |
|---|---|---|---|
| 13.11a | `index.css` | `@import url(googlefonts)` render-blocking; Inter rarely used (system font wins) | `<link rel=preconnect>` + `font-display:swap`, or drop Inter |
| 13.11b | `LeaguesTabContent` | reads/writes `CURRENT_LEAGUE_ID`/`CURRENT_DIVISION_ID` in localStorage directly, separate from App's league state | lift into a shared leagues context/provider |
| 13.11c | `EventsTabContent` | "Last 10" label hardcoded while logic is `slice(0,10)` | derive label from data, or always paginate |
| 13.11d | `EventDetailPage` | round fallback `match.round_name \|\| 'General'` shows a "General" group | use "Other matches" or hide heading |
| 13.11e | `FixturePage` | no back-to-top; rubber list can be long | collapsible sections or sticky score |
| 13.11f | H2H | `.tt-h2h-picker-vs` absolutely centred overlaps cards on ≤360px | place "VS" in its own grid cell via `gap` |
| 13.11g | `AppMessageCard` | action button is size `s`, not full-width, left aligned | `full` + centred for error/retry consistency |
| 13.11h | Throughout | `player: any`, `match: any`, `rubber: any` (dozens) | type from `player-shared.ts` (strict-mode goal) |
| 13.11i | `App.tsx` | `wrapperStyle`/`menuConfigs` push/parallax computed but `effect:'none'` always → dead code | delete menu transform logic |
| 13.11j | `App.tsx` | scroll listener attached to both `window` AND `document` (duplicate) | one listener |
| 13.11k | `SegmentedToggle` | `className="w-100"` passed but inner buttons don't stretch | container `display:flex`, buttons `flex:1` |
| 13.11l | `.tt-rubber-type-badge`, `.tt-player-metric`, `.tt-chip` | hardcoded `rgba()` backgrounds | `--surface-subtle` token (§8.11) |
| 13.11m | Player hero | `tt-player-hero::after { content:none }` leftover | remove dead rule |
| 13.11n | `PlayerInsightsPage` | "Rival Intelligence" rows are non-clickable `<a href="#">` with `preventDefaultLink` | render as `<div>`/list rows, not fake links |
| 13.11o | Icon sizes | `font-11/12/13/20/40` mixed with `font-600/700/900` (weight shares `font-N` namespace) | separate `font-size-N` / `font-weight-N` or tokens |
| 13.11p | `queries.ts` | 22 `useQuery` calls all use default `staleTime: 5min`; no per-resource policy | tune (e.g. fixtures/standings shorter, players longer) |

---

## 14. Prioritised rollout

The dependencies flow top-to-bottom: doing the architecture work first makes every later change a one-liner
instead of a multi-file edit.

### Phase 1 — Architecture & source-of-truth (≈3–4 days)
1. **Favourites hooks** (§1.1) — `useLocalStorageList` + 3 typed hooks; delete inline copies.
2. **Tab metadata** single source (§1.5) — kills the TTLive/Home/H2H/Head-to-Head confusion.
3. **Navigation consolidation** (§1.4) — delete `usePageNavigation`.
4. **Tournament aggregation + date/number formatters** (§1.3, §11) — move to `player-shared.ts`.
5. **Feedback form extraction** (§1.2).
6. Remove dead code: `favourites-scroll` (§13.7), menu transform (§13.11i), duplicate scroll listener (§13.11j),
   `console.log`s (§1.7), boot delay (§13.4).

### Phase 2 — Design-system primitives (≈4–5 days)
Build these once in `packages/design-system`, then migrate:
- `List` + `ListItem` with `leading`/`trailing` slots (§3) + `Avatar`/`RankBadge`/`IconCircle`/`Checkbox`/`Pill`.
- `SearchPanel` + `useSearch` (§4).
- `BottomSheet` + `Drawer` + shared backdrop + focus trap + overlay stack (§7).
- `HeroCard` + `SectionHeader` + `Eyebrow` (§8.1, §8.2, §8.3).
- `SegmentedToggle` variants (§6); delete `tt-players-search-scope-toggle`, `tt-picker-tabs`.
- `FavouriteButton`, `OutcomeBadge`, `ExternalLinkButton`, `MoreButton`, `EmptyState`, `ErrorState` (§8.7, §8.5,
  §12.3, §5.3, §9).
- Adopt `AppButton` everywhere; retire custom CTA classes (§5).

### Phase 3 — Tokenise (≈1–2 days)
Introduce `--radius-*`, `--space-section`, `--surface-subtle`, `--tap-min`, `--z-backdrop`/`--z-sheet` tokens
(§8.11, §10.9, §7). Replace `rgba()` magic numbers. Delete the ~35 dark-mode override pairs that this obsoletes.

### Phase 4 — Screen-by-screen migration (≈3–4 days)
In order of visibility: Players tab + Tournaments tab (search + list) → Leagues tab → Home → H2H → detail pages
(Player/Team/Fixture/Event/Insights/Matches/Tournaments) → About (full rewrite, §8.10) → sheets.

### Phase 5 — Polish & a11y (≈2 days)
- Unify header (§2.1–2.3); pick About's fate (§2.4); single theme toggle (§2.5).
- a11y sweep: real buttons, `:focus-visible`, dialog roles, heading hierarchy (§10), contrast (§10.4),
  tap targets (§10.9), `aria-live` (§10.8).
- Motion: `prefers-reduced-motion` + `@media (hover:hover)` (§13.9, §13.10).
- `useInfiniteQuery` pagination (§13.2); kill duplicate Home query (§13.3).

### Quick wins (ship today, <1hr each)
- Share-menu typo `color-whiterounded-s` → `color-white rounded-s` (§8.12).
- `<img alt="img">` → `alt=""` (§10.7).
- Remove `console.log`s (§1.7).
- Remove 350ms boot delay (§13.4).
- `aria-hidden="true"` on the slide-in header (§2.3).
