---
name: TT Players
description: Mobile-first table tennis lookup UI for fast player, league, team, fixture, and head to head answers.
colors:
  match-accent: "oklch(53% 0.18 30)"
  match-accent-focus: "oklch(59% 0.2 31)"
  match-accent-pressed: "oklch(46% 0.17 30)"
  match-accent-subtle: "oklch(53% 0.18 30 / 0.09)"
  match-accent-soft: "oklch(53% 0.18 30 / 0.16)"
  match-accent-ring: "oklch(53% 0.18 30 / 0.34)"
  success: "oklch(52% 0.13 148)"
  success-soft: "oklch(52% 0.13 148 / 0.16)"
  danger: "oklch(53% 0.16 30)"
  danger-soft: "oklch(53% 0.16 30 / 0.16)"
  danger-text: "oklch(48% 0.16 30)"
  ink: "oklch(21% 0.034 158)"
  ink-muted: "oklch(21% 0.034 158 / 0.6)"
  canvas-parchment: "oklch(96% 0.018 151)"
  surface-strong: "oklch(98% 0.011 151)"
  panel-surface: "oklch(98% 0.011 151 / 0.88)"
  border-hairline: "oklch(21% 0.034 158 / 0.1)"
  panel-border: "oklch(53% 0.18 30 / 0.13)"
  panel-border-strong: "oklch(53% 0.18 30 / 0.34)"
  on-accent: "oklch(98% 0.006 151)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "31px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: "-0.01em"
  row-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  row-meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  panel: "18px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  page-x: "16px"
components:
  button-primary:
    backgroundColor: "{colors.match-accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.row-meta}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.match-accent}"
    typography: "{typography.row-meta}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  panel-card:
    backgroundColor: "{colors.panel-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  search-panel:
    backgroundColor: "{colors.panel-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  segmented-control:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "3px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.row-title}"
    padding: "12px 0"
  status-pill:
    backgroundColor: "{colors.match-accent-subtle}"
    textColor: "{colors.match-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  bottom-nav:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    height: "auto"
---

# Design System: TT Players

## Overview

**Creative North Star: "The Match Clipboard"**

TT Players is a calm, courtside lookup tool. It should feel like a well-kept match clipboard: direct, durable, and readable while someone is standing between games with one hand free. The interface uses native mobile patterns, quiet panels, strong typographic hierarchy, and a single warm match accent to point users toward actions and key stats.

The physical scene is a player at a table tennis venue under mixed hall lighting, checking an opponent profile or league table seconds before a match. That scene forces a readable light default with a genuine dark theme for dim venues, not a decorative dark dashboard. Density is allowed, but only when it helps answer one question on the current screen.

The system rejects generic SaaS dashboards, sports betting noise, enterprise data warehouses, and flashy mobile game tropes. It is restrained by default: one accent, tinted neutrals, stable rows, minimal shadow, and motion that confirms state rather than performing.

**Key Characteristics:**
- Mobile-first AppKit shell with fixed top header and bottom tab navigation.
- Warm terracotta accent used for primary actions, selected states, rank markers, and the most important numeric emphasis.
- Tinted green neutrals keep the app from looking like a generic blue admin panel.
- Panels use 18px rounded corners, hairline borders, and inset light rather than lifted cards.
- Lists, tables, and score rows are dense, tappable, and divider-led.
- Win/loss uses labels and pill content in addition to color; red and green are never the only signal.
- Motion is short and state-based: 100-200 ms transitions, active press scale, and reduced-motion support.

## Colors

The palette is restrained: a warm match accent over green-tinted parchment and ink, with semantic success and danger colors for result states.

### Primary
- **Match Terracotta** (`{colors.match-accent}`): The only primary action and data emphasis color. Use it for selected tabs, primary buttons, active pills, top ranks, player avatars, league icons, and headline stat values.
- **Match Terracotta Focus** (`{colors.match-accent-focus}`): Keyboard and high-confidence focus treatment where a control needs a visible ring.
- **Match Terracotta Pressed** (`{colors.match-accent-pressed}`): Pressed-state depth when a color shift is needed. Most buttons already communicate press through scale.
- **Terracotta Wash** (`{colors.match-accent-subtle}` / `{colors.match-accent-soft}`): Quiet backgrounds for rank badges, selected rows, inactive result pills inside hero cards, and hover/active row states.
- **Terracotta Ring** (`{colors.match-accent-ring}`): Two-pixel focus rings and active selection outlines.

### Secondary
- **Form Green** (`{colors.success}`): Win, success, and calendar-positive states. It appears in form pills and success icons with text labels.
- **Result Red** (`{colors.danger}` / `{colors.danger-text}`): Loss, error, failed loading, and danger states. Use with explicit copy such as "Unable to load" or "Loss."

### Neutral
- **Table Ink** (`{colors.ink}`): Main text, player names, team names, table row titles.
- **Muted Ink** (`{colors.ink-muted}`): Secondary descriptions, metadata, scope labels, table headings, and helper copy.
- **Parchment Canvas** (`{colors.canvas-parchment}`): App background and low-emphasis sections.
- **Strong Surface** (`{colors.surface-strong}`): Header, footer bar, active segmented tabs, and raised-neutral controls.
- **Panel Surface** (`{colors.panel-surface}`): Hero/search/selection panels. It remains slightly translucent so the AppKit shell feels cohesive.
- **Hairline Border** (`{colors.border-hairline}`): Dividers between rows, table cells, and panel subsections.

### Named Rules

**The One Match Color Rule.** Terracotta is the only accent. Do not introduce generic sports blue, betting neon, or rank rainbow colors for ordinary UI emphasis.

**The Result Redundancy Rule.** Red and green must be paired with text, letters, icons, position, or numeric labels. Color alone is forbidden for win/loss or trend meaning.

## Typography

**Display Font:** System stack with SF Pro Text and Inter fallback.
**Body Font:** Same system stack.
**Label/Mono Font:** No separate mono face; tabular numerals are used for data.

**Character:** Native, compact, and readable. The system uses platform-like type behavior without becoming marketing: tight headings, practical row titles, clear metadata, and tabular numbers wherever standings or match records need scan speed.

### Hierarchy
- **Display** (600, 31px, 1.08): Player search titles and player profile names. Use only for the main object of the screen.
- **Headline** (600, 27-29px, 1.08-1.1): League, team, fixture, and bottom-sheet titles.
- **Title** (600, 17px, 1.25): Section headers such as Current Season, Form, and Recent Matches.
- **Body** (400, 17px, 1.47): Default reading copy. Keep prose at 65-75ch maximum, though most mobile surfaces should be much shorter.
- **Row Title** (600, 14-15px, 1.25): Player, team, league, and navigation row labels.
- **Row Meta** (400-600, 12-13px, 1.3-1.35): League/division metadata, descriptions, and secondary table values.
- **Label** (700, 11-12px, 0.04-0.05em): Eyebrows, KPI labels, table headings, badges, and compact status text. Use uppercase sparingly.

### Named Rules

**The Numbers First Rule.** Important records use tabular numerals, stronger weight, and proximity to labels before any decorative treatment.

**The One Family Rule.** Product UI labels, buttons, data, and headings stay in the same system sans stack. Do not add display fonts for personality.

## Elevation

TT Players is flat by default. Depth is conveyed through tonal surfaces, hairline dividers, focus rings, and a restrained inset highlight on 18px panels. Shadows are structural and rare; they appear only on active segmented tabs or native shell affordances.

### Shadow Vocabulary
- **Panel Inset Light** (`box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.62)`): Light-theme hero, search, H2H, team, fixture, and league panels. This is a surface polish, not card lift.
- **Dark Panel Inset** (`box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04)`): Dark-theme counterpart for panels.
- **Selected Tab Lift** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08)`): Active segmented tabs. Do not apply to every button.
- **Focus Ring** (`box-shadow: 0 0 0 2px var(--accent-ring)`): Search boxes, active tiles, and focus-visible components.

### Named Rules

**The Settled Surface Rule.** Panels rest on the canvas; they do not float. If a surface needs hierarchy, use a divider, a stronger tone, or a focus ring before using shadow.

## Components

### Buttons
- **Shape:** Full pill for actions (999px radius), compact 40-42px minimum height.
- **Primary:** Match Terracotta background with on-accent text, 13px semibold label, 0 14px padding. Used for league filters, save state, scope pills, add/select actions, and active tab badges.
- **Hover / Focus:** Hover uses subtle terracotta washes on rows and tiles. Focus-visible uses a 2px terracotta ring. Active press uses `transform: scale(0.95)` on AppKit `.btn`.
- **Secondary / Ghost:** Transparent or parchment fill with terracotta text and a terracotta border/wash. Use for Save before selection, source links, remove badges, and filter chips.

### Chips
- **Style:** Pills with 12px labels, 600-700 weight, 8-12px horizontal padding, and terracotta subtle backgrounds for active or meaningful states.
- **State:** Selected chips move from neutral tint to terracotta soft fill and terracotta ring. Win/loss form pills use success/danger soft fills outside hero panels; inside hero panels they collapse to terracotta to keep the hero unified.

### Cards / Containers
- **Corner Style:** 18px for hero/search/league panels, 16px for H2H picker cards, 12px for context toggles, 8px for metric cells.
- **Background:** Panel Surface for primary mobile panels, Parchment Canvas for section bands, Strong Surface for headers, active tabs, and neutral controls.
- **Shadow Strategy:** Inset panel light only. Do not add drop shadows to ordinary cards.
- **Border:** 1px hairline or panel border. Dividers separate data rows inside sections.
- **Internal Padding:** 16px for panels, 20px top and 16px sides for section bands, 12px for row groups and compact controls.

### Inputs / Fields
- **Style:** Search fields are integrated into panels or bottom sheets. They use transparent input backgrounds, 17px body type, icon-leading layout, and hairline separation or pill search box chrome.
- **Focus:** Parent surface receives a 2px terracotta ring or stronger panel border on focus-within.
- **Error / Disabled:** Disabled controls reduce opacity to around 0.5. Error states use Result Red text with explicit failure copy.

### Navigation
- **Header:** Fixed AppKit header with centered title, side icon actions, Strong Surface background, Ink text, and hairline border.
- **Bottom Tabs:** Four item bottom nav: Home, Players, Leagues, H2H. Active tab uses Match Terracotta on icon and label.
- **Rows:** Navigation rows use 40px rounded icon wells, 15px semibold titles, 13px muted descriptions, and a chevron that nudges 2px on hover.
- **Bottom Sheets:** League scope uses a 72 percent height bottom sheet with a fixed top region, search box, segmented tabs, and 58px league rows.

### Tables / Data Lists
- **Standings:** Compact table, 11px uppercase headers, 13px numeric cells, hairline row dividers, left-aligned team column, terracotta points.
- **Player Rows:** 42px circular avatar, 15px semibold name, 13px muted metadata, optional 34px favourite icon.
- **Leader Rows:** Rank badge, player name, W/L/P stat string, and win-rate pill. The row answers one scan question without opening the player.

## Do's and Don'ts

### Do:
- **Do** keep the app mobile-first. Primary panels start at 16px page margins and must fit one-handed lookup.
- **Do** use `{colors.match-accent}` for primary action, current selection, and key numeric emphasis only.
- **Do** use hairline dividers for dense data rows instead of wrapping every row in a card.
- **Do** keep result indicators redundant: W/L letters, labels, positions, or copy must accompany success/danger colors.
- **Do** use tabular numerals for win rates, records, standings, scores, and match counts.
- **Do** respect `prefers-reduced-motion`; state transitions are useful, page choreography is not.
- **Do** keep empty and error states plain and actionable: "No data available for the selected leagues" beats decorative copy.

### Don't:
- **Don't** use generic SaaS dashboards: no blue sidebars, white-card sprawl, or hero-metric templates.
- **Don't** use sports betting site language or visuals: no neon accents, flashing odds, odds-board density, or overstimulating feeds.
- **Don't** copy enterprise data warehouses: avoid gray-on-gray chrome, dense tables without hierarchy, and information overload unsuitable for quick lookup.
- **Don't** add flashy mobile game tropes: no reward popups, celebratory animations, or gamified badges that reduce data credibility.
- **Don't** add side-stripe borders, gradient text, decorative glassmorphism, or repeated icon-heading-text card grids.
- **Don't** use red and green as the only meaning channel for form, win/loss, or trend.
- **Don't** introduce display fonts, decorative serif headings, or full-saturation inactive states.
