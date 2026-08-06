# Shadcn migration architecture

## Decision

The TT design system uses **shadcn conventions with Radix primitives** as its behavioural foundation. TT applications continue to consume the branded `@tt-players/design-system` API rather than importing Radix or generated primitives directly.

```text
Radix behaviour + shadcn source conventions
                    ↓
       TT semantic tokens and wrappers
                    ↓
  TT Players and other mobile-first PWAs
```

This keeps the benefits of shadcn—owned source, composable primitives, `data-slot` hooks, CVA variants and Tailwind utilities—without turning individual applications into separate copies of the design system.

## Examination of the previous system

The pre-migration package already contained a strong product-level vocabulary:

- mobile shell, headers, tab bar and safe-area handling;
- flat and raised surfaces, section hierarchy and density variants;
- compact lists, avatars, metrics, filters and match records;
- table-tennis outcomes and domain compositions;
- light/dark semantic tokens;
- a component catalogue and focused Playwright screenshot workflow.

Those contracts remain the public system. The migration targets the lower-level implementation weaknesses:

1. `BottomSheet`, `AppDrawer` and the app-owned `MainDrawer` each implemented their own focus trap, Escape listener, body scroll lock and focus restoration.
2. Switch and segmented controls manually recreated behaviour supplied by accessible primitives.
3. Class composition did not merge Tailwind conflicts.
4. Core brand colours and control styling were partly owned by the first application instead of the package.
5. Consumers imported five individual package stylesheets through repository-relative source paths.
6. Loading and close icons depended on legacy Font Awesome markup even in package primitives.

## Layers

### `components/ui`

Owned shadcn-style source components:

- `Button`
- `Card` / `CardContent`
- `Input`
- `Switch`
- `ToggleGroup` / `ToggleGroupItem`
- `Dialog` primitives

These are exported through the package's `./primitives` subpath for advanced composition. Product screens should normally use the TT wrappers instead.

### TT wrappers

Stable public components preserve existing props and class hooks:

- `AppButton` / `AppButtonLink`
- `AppCard`
- `AppSearchInput`
- `AppSwitch`
- `SegmentedToggle`
- `BottomSheet`
- `AppDrawer`

Domain components such as `MatchRecordRow`, `OutcomeBadge`, `EntityHero`, `PageSection`, `DesignList` and `MetricGrid` remain TT-owned compositions. Replacing those with generic shadcn examples would remove useful product semantics.

### Styling

`@tt-players/design-system/styles.css` is the single package stylesheet entry point. It contains:

- TT brand theme values;
- semantic geometry and density tokens;
- Tailwind v4 theme and utilities without Preflight;
- portable control styles;
- search, layout, shell, sheet and drawer contracts.

Tailwind is an implementation tool. Applications should use semantic TT components and tokens rather than duplicating utility strings for canonical UI.

## Overlay behaviour

Radix Dialog now owns:

- modal semantics and accessible labelling;
- background inertness;
- focus trapping and restoration;
- Escape and outside-interaction handling;
- nested layer behaviour;
- portal rendering and scroll locking.

TT wrappers still own bottom-sheet/page presentation, drawer geometry, safe-area padding, headings, footer regions and product-specific close rules.

## Migration compatibility

- Existing `tt-*` selectors and component props are retained where practical.
- `AppSwitch` adopts the boolean `onCheckedChange` callback used by Radix instead of exposing a fake checkbox `ChangeEvent`.
- `cx` remains as a deprecated alias of the canonical `cn` helper.
- Existing application CSS may continue during screen migration, but new TT-branded apps can start from the package stylesheet alone.

## Acceptance

The migration is gated by:

- `pnpm check:design-system`;
- mobile TypeScript/Vite build;
- Vitest contracts for TT and shadcn-backed primitives;
- focused Playwright interaction assertions;
- 390px and 320px screenshots in light and dark themes;
- bottom-sheet and navigation-drawer focus restoration;
- horizontal-overflow and touch-target checks.
