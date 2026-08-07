# TT Players Mobile Density System

**Date:** 2026-07-31  
**Status:** Implemented in draft PR #49  
**Scope:** `apps/mobile`, `packages/design-system`

## 1. Purpose

This document records the density and spacing decisions reached during visual review of the mobile UI polish work.

TT Players should feel like a **premium native sports application**, not a sparse responsive website and not a cramped enterprise data tool. The system therefore separates visually important editorial surfaces from high-frequency operational content.

The target balance is:

- attractive and recognisably branded;
- native-feeling on Android and iOS;
- efficient enough to show useful information without excessive scrolling;
- consistent across player, league, tournament, fixture, ranking and H2H screens;
- readable and touch-friendly at all supported phone widths.

## 2. Density model

The application uses four density roles.

### 2.1 Hero density

Used for principal identity and summary surfaces:

- player profile hero;
- player insights overview;
- league overview;
- tournament overview;
- major event or ranking summary.

Hero surfaces may use stronger typography, rounded raised cards, larger identity marks and selective accent colour. They should remain visually memorable, but must not delay access to the next useful section.

Typical guidance:

- outer page gutter: `12–16px`;
- internal padding: `14–16px`;
- major internal gap: `10–14px`;
- large title: responsive, normally `27–36px`;
- card radius: approximately `16px`;
- subtle border and restrained elevation.

### 2.2 Standard density

Used for controls and grouped information:

- search panels;
- metric grids;
- filter groups;
- segmented controls;
- rating-range summaries;
- empty and loading states;
- standard cards.

Typical guidance:

- internal padding: `12–14px`;
- control height: `44–46px`;
- section gap: `10–14px`;
- heading-to-content gap: `6–8px`.

### 2.3 Dense operational lists

Used for content users scan repeatedly:

- player lists;
- standings;
- fixtures and matches;
- tournament players;
- rankings;
- player history;
- search results;
- teams and divisions.

Dense does **not** mean small text or inaccessible controls. Density is achieved by removing redundant whitespace and nested padding.

Typical guidance:

- visible row height: approximately `54–56px`;
- row vertical padding: approximately `5px`;
- avatar: `38–40px`;
- title: approximately `14.5–15px`;
- subtitle: approximately `10.5–11px`;
- content gap: `8px`;
- trailing action remains at least `44x44px`;
- divider aligned consistently across the full list surface;
- no additional card margin inside an already-guttered section.

### 2.4 Flat uncarded sections

Used for sections that sit directly on the page canvas:

- Form;
- Rating History;
- Rival Intelligence;
- current-season team/tournament lists;
- Last Matches;
- ordinary section headings followed by a list or chart.

Flat sections should not inherit card-like padding. The page owns the horizontal gutter and the section owns only its internal vertical rhythm.

Typical guidance:

- horizontal page gutter: `12px` on standard phones;
- narrow-phone gutter: `10px`;
- section-to-section gap: approximately `8–10px`;
- heading-to-content gap: approximately `5–7px`;
- section header margin-bottom: approximately `6px`;
- no shadow, raised surface or large corner radius unless the content itself requires grouping.

## 3. Spacing tokens

The base scale remains a 4-point system:

- `4px`: tightly related icon or label details;
- `8px`: compact component gaps;
- `12px`: page gutter and standard compact separation;
- `16px`: hero/card padding and stronger grouping;
- `20–24px`: reserved for genuine major transitions, not routine sections;
- `32px`: exceptional editorial separation only.

Implementation-specific density tokens introduced in PR #49 include:

- compact section gap: around `10px`;
- dense row height: around `56px`;
- compact control height: `44px`;
- flat-section gutter: `12px`;
- narrow-phone flat-section gutter: `10px`.

Avoid arbitrary one-off values when an existing role or token applies.

## 4. Layout ownership rules

The largest regressions during implementation came from applying gutters at multiple levels. The final rules are:

1. **One component owns the horizontal gutter.**
2. A child list must not add another outer margin when its section already owns placement.
3. `width: 100%` must not be combined with horizontal margins unless sizing explicitly accounts for them.
4. Raised cards own internal padding, but flat sections do not imitate cards.
5. Dividers belong to the list surface and should use one consistent inset policy.
6. Section headings, helper text and controls must remain within the same content width.
7. Narrow-screen layouts may stack heading notes rather than overflow the trailing edge.

## 5. Typography hierarchy

Compactness should come from spacing and hierarchy, not from making text tiny.

- Detail-header title: approximately `17px`.
- Root-header title: approximately `23–28px`.
- Section title: approximately `17px`.
- Dense row title: approximately `14.5–15px`.
- Dense row subtitle: approximately `10.5–11px`.
- Helper/note text: approximately `11px`.
- Metric values remain large enough to scan quickly.

Use weight, colour and line height to establish hierarchy. Secondary metadata should be calm but still meet contrast requirements.

## 6. Navigation and shell density

### 6.1 Detail header

- safe-area aware;
- approximately `56px` content height;
- Back is the sole standard left action;
- no redundant Home action where bottom navigation provides recovery;
- no more than two visible right actions before overflow;
- title truncates safely without crowding actions.

### 6.2 Root header

- approximately `64px` content height;
- compact title and action alignment;
- no large blank expanded-header region;
- contextual league state uses a small count badge rather than a text label overlapping the filter icon.

### 6.3 Bottom navigation

- five icons and labels remain visible in all states;
- approximately `58px` plus bottom safe area;
- inactive icons use a readable muted colour;
- active state uses colour plus a structural icon background;
- each tab retains at least a `44px` interaction target;
- content receives sufficient footer clearance without excessive blank space.

### 6.4 Drawer

- approximately `86%` of viewport width, capped near `360px`;
- compact hero/header;
- rows around `56px`;
- reduced section spacing;
- build metadata remains present but visually secondary.

## 7. Cards and surfaces

Use cards selectively.

Cards are appropriate for:

- principal hero summaries;
- related metrics that require a shared boundary;
- messages, warnings and actionable states;
- overlays and sheets.

Cards are generally unnecessary for:

- ordinary lists;
- a section heading followed by content;
- chart sections already separated by page rhythm;
- nested content within another card.

Avoid nested raised cards. Surface hierarchy should normally be:

1. canvas;
2. flat section;
3. one raised card where grouping or emphasis is meaningful;
4. floating navigation or overlay only when required.

## 8. Touch and accessibility constraints

Visual compaction must preserve usability:

- primary actions and trailing icon buttons: at least `44x44px`;
- controls remain reachable with one hand;
- focus indicators remain visible;
- text must not be reduced below comfortable mobile reading sizes;
- active navigation cannot rely on colour alone;
- reduced-motion behaviour remains supported;
- safe-area insets are always honoured;
- right-edge overflow is prohibited at supported widths.

## 9. Responsive behaviour

At narrow widths:

- flat-section gutters may reduce from `12px` to `10px`;
- avatars may reduce slightly while touch targets remain unchanged;
- section title notes may stack under the title;
- metric grids may reduce gaps or change columns;
- labels may truncate, but critical values and actions must remain available;
- horizontal filter controls may scroll rather than compress text excessively.

## 10. Visual review checklist

Every screen should be reviewed using the following questions:

1. Is the first useful information visible without unnecessary scrolling?
2. Is this surface genuinely a card, or should it be flat?
3. Is horizontal padding applied exactly once?
4. Are list rows compact but still readable and tappable?
5. Do headers and navigation preserve safe areas without wasting space?
6. Does the screen share the same section, typography and divider rhythm as comparable screens?
7. Does the experience still feel premium and sports-oriented?
8. Are loading, empty, error and offline states consistent with the final density?
9. Does the screen work at approximately 320px, 360px, 390px and larger phone widths?
10. Are both light and dark themes visually intentional?

## 11. Implementation mapping

The final PR #49 layering is intentionally incremental:

- `mobile-polish.css`: shared native shell and compatibility foundations;
- `density-pass.css`: compact navigation, headers, cards, controls, lists and drawer;
- `uncarded-density.css`: final flat-section and dense-list rhythm;
- shared components in `packages/design-system`: canonical classes and semantics.

These layers coexist with legacy AppKit styling during migration. Future work should move stable values into design-system tokens and shared component variants, then remove compatibility overrides once all screens have migrated.

## 12. Follow-up migration rule

New screens and newly touched screens must use the density roles in this document rather than introducing local page-specific spacing systems.

When a one-off exception is necessary, document why it is a hero, standard, dense-list or flat-section exception. The long-term objective is to make the density roles explicit component variants instead of relying on selector-based compatibility CSS.
