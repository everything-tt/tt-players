# AppKit Template Alignment Review

## Summary

The mobile app has a solid AppKit foundation but deviates from the template in several structural, visual, and interaction patterns. Below is a page-by-page analysis with specific misalignments ranked by severity.

**Severity levels:** 🔴 Critical (breaks AppKit layout contract) · 🟠 Major (visible visual/UX divergence) · 🟡 Minor (polish gap)

---

## 1. Page Shell Structure

### Expected (AppKit Template)
```html
<div id="page">
  <div class="header header-fixed header-logo-center header-auto-show">...</div>
  <div class="footer-bar-3">...</div>  <!-- outside page-content -->
  <div class="page-content">
    <!-- all scrollable content -->
  </div>
</div>
```

### Current (App)
- Uses custom `app-shell-page` / `app-shell-content` wrapper classes instead of `#page` + `.page-content`.
- Header is conditionally rendered inside component logic rather than using the standard `header header-fixed` pattern.
- The footer bar is rendered correctly outside content area ✅.

| Issue | Severity | Detail |
|-------|----------|--------|
| Missing `#page` root | 🔴 | AppKit JS (back-to-top, scroll handlers, menu positioning) expects `#page`. The app uses `.app-shell-page` instead. |
| Missing `.page-content` wrapper | 🔴 | All scrollable content should be inside `.page-content`. The app uses `.app-shell-content`. |
| Header not using `header-auto-show` | 🟠 | AppKit headers auto-hide/show on scroll with this class. The app always shows the header. |

---

## 2. Header

### Expected (AppKit Template)
```html
<div class="header header-fixed header-logo-center header-auto-show">
  <a class="header-icon header-icon-1" data-back-button><i class="fas fa-chevron-left"></i></a>
  <span class="header-title">Page Title</span>
  <a class="header-icon header-icon-4"><i class="fas fa-cog"></i></a>
</div>
```
- Uses Font Awesome icons
- Supports `data-back-button` for native back
- `header-logo-center` centers the title
- `header-icon-{1-4}` positions icons (1=left, 4=right)

### Current (App)
- Header uses custom layout with mixed React state for title/visibility.
- Uses Lucide icons (or custom SVG) instead of Font Awesome.
- No `data-back-button` — uses React Router navigation.
- Header title changes dynamically via state.

| Issue | Severity | Detail |
|-------|----------|--------|
| Icons are Lucide, not Font Awesome | 🟡 | Functional but not template-aligned. Template uses `fas fa-*` classes. |
| Missing `data-back-button` pattern | 🟠 | AppKit's built-in back button behavior is bypassed. |
| No `header-auto-show` | 🟠 | Header doesn't hide/show on scroll, losing vertical space on long pages. |

---

## 3. Home Dashboard (HomeTabContent)

### Expected (AppKit Template — page-dashboard.html)
- Stats in a **2-column grid** of small cards (`col-6`), each with icon + number + label
- Featured items as **full-width image cards** with gradient overlay
- List groups with badges for quick navigation
- Progress bars for visual indicators
- Clean white cards with subtle shadows

### Current (App)
- Summary card uses custom `tt-home-summary` styling — a single card with 4 stat items in a row
- Leaders section uses custom `tt-home-leaders` — not standard AppKit list pattern
- Navigation rows use custom styling instead of `list-group list-custom-large`

| Issue | Severity | Detail |
|-------|----------|--------|
| Stats not in 2-col grid cards | 🟠 | Template uses `col-6` card grid. App uses a single card with 4 inline items. |
| Leaders section is fully custom | 🟠 | Should use `list-group list-custom-small` or `list-custom-large` with avatar images. |
| Navigation rows aren't AppKit lists | 🟠 | Should use `list-group list-menu` pattern for the nav rows. |
| Missing `content` wrapper inside cards | 🟠 | AppKit cards with text need `<div class="content">` for proper padding. |

---

## 4. Player Profile (PlayerPage)

### Expected (AppKit Template — page-profile-1/2/3)
Three template options exist:
1. **Profile 1**: Cover photo with gradient overlay, avatar overlapping, stats row (photos/followers/following), photo grid
2. **Profile 2**: Side-by-side avatar+name, follow buttons, gallery tabs
3. **Profile 3**: Instagram-style with stories, stats row, grid

Common patterns:
- Large avatar with `bg-gradient` cover
- Stats displayed as a **row of centered numbers** with labels beneath
- Content cards for bio/details
- `list-group` for action items
- Chips for tags/skills

### Current (App)
- Uses custom hero card with avatar + name + team
- Win-rate as a large number readout (custom)
- Form pills (custom `FormResultPills`)
- Stat chips in a flex row (custom)
- Favourite toggle button
- Season affiliations as custom cards
- Last 10 matches as custom list

| Issue | Severity | Detail |
|-------|----------|--------|
| No cover photo / gradient hero | 🟠 | Template profiles have a hero bg image with gradient. App uses a plain card. |
| Stats not in centered row | 🟠 | Template uses a row of stat blocks (number + label). App uses custom stat chips. |
| Form pills are fully custom | 🟡 | Could use AppKit `chip` classes (`chip chip-s bg-green/red`) instead of custom W/L/D pills. |
| Season cards are custom | 🟠 | Should use `list-group list-custom-small` or standard card pattern. |
| Missing `content` padding wrapper | 🟠 | Card inner content should use `<div class="content">`. |
| Favourite toggle isn't AppKit-style | 🟡 | Could use a standard icon button in header or a chip toggle. |

---

## 5. Player Insights (PlayerInsightsPage)

### Expected (AppKit Template)
- Dashboard-style stats cards (col-6 grid)
- Timeline component for career history (`timeline-deco`, `timeline-item`)
- List groups for rival intelligence

### Current (App)
- Hero card with gradient (good ✅)
- Rival intelligence in custom cards
- Career timeline fully custom

| Issue | Severity | Detail |
|-------|----------|--------|
| Career timeline is custom | 🟠 | Should use AppKit `timeline-body` > `timeline-deco` > `timeline-item` pattern from `page-timeline-1.html`. |
| Rival cards are custom | 🟡 | Could use `list-group list-custom-large` with icon + text + badge pattern. |

---

## 6. Player Matches (PlayerMatchesPage)

### Expected (AppKit Template)
- Match list using `list-group list-custom-small` or `list-custom-large`
- Each item with icon/badge for result (W/L/D)
- Pagination using "Load More" button pattern

### Current (App)
- Custom match row styling
- Load more button at bottom

| Issue | Severity | Detail |
|-------|----------|--------|
| Match list is fully custom | 🟠 | Should use `list-group list-custom-small` with result as a badge/chip on the right. |
| Missing list item separators | 🟡 | AppKit lists have built-in separators via the list-group pattern. |

---

## 7. Leagues Tab (LeaguesTabContent)

### Expected (AppKit Template)
- Grid of cards for league selection (using `col-6` or `col-4` card grid)
- KPI stats in small dashboard cards
- Standings as a styled table or `list-group list-custom-small` with position badges
- Source link as a button with icon

### Current (App)
- Custom league grid with `tt-league-tile` styling
- KPI snapshot in custom card
- Standings table fully custom
- Source button custom

| Issue | Severity | Detail |
|-------|----------|--------|
| League grid tiles are custom | 🟠 | Should use AppKit card grid pattern (`card card-style` in `col-6` or `col-4`). |
| Standings table is custom CSS | 🟠 | Should use AppKit table styling or a ranked list-group pattern. |
| KPI cards are custom | 🟠 | Should use standard dashboard stat cards (col-6, icon + number + label). |

---

## 8. H2H Tab (H2HTabContent)

### Expected (AppKit Template)
- Versus/comparison cards using AppKit card patterns
- Score bar using progress bars (`progress` + `progress-bar`)
- Encounter list using `list-group`
- Player pickers as cards with search overlay

### Current (App)
- Custom hero card
- Custom player picker cards
- Custom win bar (`tt-h2h-bar`)
- Custom encounter list

| Issue | Severity | Detail |
|-------|----------|--------|
| Win bar is custom CSS | 🟠 | Should use AppKit `progress` + `progress-bar` components with `bg-highlight`. |
| Player pickers are custom | 🟠 | Should use card + search pattern from component-search.html. |
| Encounter list is custom | 🟠 | Should use `list-group list-custom-small`. |

---

## 9. Team Page (TeamPage)

### Expected (AppKit Template)
- Summary card with position chips using standard card pattern
- Squad roster using `list-group list-custom-large` with avatars
- Fixtures using list-group or timeline

### Current (App)
- Custom summary card
- Uses `PlayerList` component (closer to template ✅)
- Custom fixture cards

| Issue | Severity | Detail |
|-------|----------|--------|
| Summary card is custom | 🟡 | Could align more closely with standard `card card-style` with `content` padding. |
| Fixtures are custom cards | 🟠 | Should use `list-group list-custom-small` or timeline pattern. |

---

## 10. Fixture Detail (FixturePage)

### Expected (AppKit Template)
- Hero score card using `card card-style bg-{N}` with gradient
- Rubber breakdown using `list-group list-custom-small` with player links
- Source link as a standard button

### Current (App)
- Uses hero card with gradient ✅
- Rubber breakdown as custom list

| Issue | Severity | Detail |
|-------|----------|--------|
| Rubber breakdown is custom | 🟠 | Should use `list-group list-custom-small` with player name as link. |

---

## 11. League Selection (LeagueSelectionPage)

### Expected (AppKit Template — component-action-sheets.html)
```html
<div id="menu-id" class="menu menu-box-bottom rounded-m" data-menu-height="480">
  <div class="content">
    <!-- sheet content -->
  </div>
</div>
```
- Bottom sheet triggered by `data-menu="menu-id"`
- Contains tabs for switching views
- Search input inside the sheet
- List items with check marks for selection

### Current (App)
- Uses custom bottom sheet implementation
- Has tabs (Selected/Leagues/Areas) ✅
- Search filter ✅
- Custom selection UI

| Issue | Severity | Detail |
|-------|----------|--------|
| Not using AppKit menu-box-bottom | 🔴 | The sheet should use `menu menu-box-bottom rounded-m` with `data-menu-height`. Currently a fully custom implementation. |
| Tab switching is custom | 🟠 | Should use AppKit `tab-controls tabs-small tabs-rounded` with `data-highlight`. |
| Selection check marks are custom | 🟡 | Could use standard list items with checkmark icons. |

---

## 12. Player Search (PlayerSearchSheet)

### Expected (AppKit Template — component-search.html)
```html
<div class="search-box search-dark">
  <input type="text" data-search>
</div>
<div class="search-results">
  <a class="d-flex" data-filter-item data-filter-name="Player Name">
    <!-- result item -->
  </a>
</div>
```
- Search input with `data-search` attribute for auto-filtering
- Results with `data-filter-item` and `data-filter-name` for client-side filtering
- `search-no-results` for empty state

### Current (App)
- Custom search input with debounce
- Custom result list
- API-based search (server-side)

| Issue | Severity | Detail |
|-------|----------|--------|
| Search is fully custom | 🟠 | Server-side search is correct for the use case, but the UI should use AppKit search styling patterns. |
| No `search-no-results` state | 🟡 | Should show styled empty state when no results found. |

---

## 13. Footer Bar / Tab Navigation (TabFooterBar)

### Expected (AppKit Template — component-footers.html)
```html
<div id="footer-bar" class="footer-bar-3">
  <a href="#" class="active-nav">
    <i class="fas fa-home"></i>
    <span>Home</span>
  </a>
  <!-- more tabs -->
</div>
```
- Uses `footer-bar-3` style (or 1-6)
- Font Awesome icons
- `active-nav` class on current tab
- Optional `circle-nav` for center elevated button

### Current (App)
- Uses `footer-bar-3` ✅
- Uses custom SVG icons instead of Font Awesome
- Has `active-nav` ✅

| Issue | Severity | Detail |
|-------|----------|--------|
| Icons are SVG, not Font Awesome | 🟡 | Works fine but not template-aligned. Template uses `fas fa-*`. |

---

## 14. Cards — General Pattern

### Expected (AppKit Template)
```html
<div class="card card-style">
  <div class="content">
    <h4 class="font-600">Title</h4>
    <p class="font-11 opacity-60 mb-0">Subtitle</p>
  </div>
</div>
```
- All text inside cards uses `<div class="content">` for padding
- Image cards use `card-top` / `card-center` / `card-bottom` for positioning
- Colored cards use `bg-{N}` class
- Gradient overlays use `card-overlay bg-gradient`

### Current (App)
- Cards are used but often missing the `content` wrapper
- Many cards have custom CSS classes (`tt-player-hero`, `tt-home-summary`, etc.)

| Issue | Severity | Detail |
|-------|----------|--------|
| Missing `content` wrapper in cards | 🔴 | Many cards put text directly inside `.card` without `.content`. This breaks AppKit padding/spacing. |
| Over-reliance on custom CSS | 🟠 | ~1500 lines of custom CSS (`app-shell.css`) that replicate AppKit patterns. Should use native AppKit classes. |

---

## 15. Theming & Colors

### Expected (AppKit Template)
- Theme switching via `data-highlight="bg-{color}"` on `#page`
- Built-in color system: `bg-red`, `bg-green`, `bg-blue`, `bg-highlight`, etc.
- `color-highlight` for accent text
- Light/dark via `theme-dark` / `theme-light` on `#page`

### Current (App)
- Custom CSS variables for colors ✅ (correct approach for dynamic theming)
- Overrides `--color-highlight` and related variables ✅
- Light/dark toggle via `theme-dark` class ✅

| Issue | Severity | Detail |
|-------|----------|--------|
| Color overrides are working well | ✅ | The theming approach is correct and compatible with AppKit. |

---

## 16. Typography

### Expected (AppKit Template)
- Font size classes: `font-8` through `font-40`
- Font weight classes: `font-100` through `font-900`
- Utility: `uppercase`, `text-start`, `text-center`, `opacity-{N}`
- Inter font ✅

### Current (App)
- Uses Inter font ✅
- Many inline `fontSize` styles in TSX instead of AppKit font classes
- Custom font sizing in CSS

| Issue | Severity | Detail |
|-------|----------|--------|
| Inline fontSize instead of font classes | 🟠 | Should use AppKit `font-{N}` classes (e.g., `font-13`, `font-600`) instead of inline styles. |
| Missing `uppercase` class usage | 🟡 | Section headers that are uppercase should use `uppercase` utility. |

---

## 17. Spacing

### Expected (AppKit Template)
- Bootstrap utility classes: `mb-0`, `mt-2`, `px-3`, `py-2`, etc.
- `content` wrapper provides standard card padding
- `divider` class for separators

### Current (App)
- Mix of inline styles, custom CSS, and some Bootstrap utilities
- Custom margin/padding in `app-shell.css`

| Issue | Severity | Detail |
|-------|----------|--------|
| Inconsistent spacing approach | 🟠 | Should standardize on Bootstrap utility classes from AppKit. |

---

## 18. Animations & Transitions

### Expected (AppKit Template)
- Page transitions via CSS classes
- Menu slide-in animations built-in
- Back-to-top with smooth scroll
- Card hover/press effects

### Current (App)
- Boot screen with custom animation ✅
- Slide menu with custom animation
- Page transitions via React Router (no CSS transitions)

| Issue | Severity | Detail |
|-------|----------|--------|
| No page transition animations | 🟡 | Moving between pages has no slide/fade transition. |
| Back-to-top missing | 🟡 | AppKit has built-in back-to-top. App doesn't use it. |

---

## Priority Fix List

### 🔴 Critical (Layout Contract)
1. **Add `#page` id to root wrapper** — Required for AppKit JS behaviors
2. **Wrap all scrollable content in `.page-content`** — Required for proper scrolling
3. **Add `.content` wrapper inside all cards with text** — Required for correct padding
4. **Convert LeagueSelectionPage to `menu-box-bottom`** — Required for AppKit bottom sheet behavior

### 🟠 Major (Visual Alignment)
5. **Home stats**: Switch to 2-col grid of dashboard stat cards
6. **Player profile**: Add cover photo hero with gradient overlay
7. **All lists**: Replace custom lists with `list-group list-custom-small/large`
8. **H2H win bar**: Use AppKit `progress` / `progress-bar`
9. **Player timeline**: Use AppKit `timeline-body` / `timeline-item`
10. **League grid**: Use standard card grid instead of custom tiles
11. **Standings**: Use AppKit table or ranked list pattern
12. **Replace inline styles**: Use AppKit font/spacing utility classes
13. **Header**: Add `header-auto-show` for hide-on-scroll

### 🟡 Minor (Polish)
14. **Icons**: Switch to Font Awesome for template consistency
15. **Chips for form pills**: Use `chip chip-s` instead of custom W/L/D pills
16. **Page transitions**: Add slide/fade animations between routes
17. **Back-to-top**: Enable AppKit's built-in scroll-to-top
18. **Empty states**: Use `search-no-results` pattern for no-data views
