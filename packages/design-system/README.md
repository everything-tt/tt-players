# TT Players Design System

Reusable React primitives for TT-branded mobile-first PWAs. The package uses shadcn source conventions and Radix behaviour beneath a stable TT semantic API. Components stay portable: no feature data fetching, route knowledge, or direct product state ownership.

## Module boundaries

- `components/AppButton.tsx` — canonical button primitives. Use `AppButton` for actions; keep `AppButtonLink` only for true link-styled navigation.
- `components/List.tsx` — current generic list primitive with slots (`leading`, `title`, `subtitle`, `trailing`). Prefer this over legacy row components for ordinary new lists.
- `components/MatchRecordRow.tsx` — canonical compact completed-result row. It owns the leading score tile, title/metadata hierarchy, primary row action, and zero to two direct secondary actions. Consumers provide an already-oriented score model and all business behaviour.
- `components/States.tsx` — `HeroCard`, `SectionHeader`, `EmptyState`, `ErrorState`.
- `components/BottomSheet.tsx` and `components/AppDrawer.tsx` — TT mobile overlays composed from the shadcn/Radix Dialog foundation. Radix owns focus, inertness, Escape handling and restoration; TT owns geometry and safe areas.
- `components/ui/` — owned shadcn-style low-level source (`Button`, `Card`, `Input`, `Switch`, `ToggleGroup`, `Dialog`). Product screens should normally use the TT wrappers above.
- `styles/index.css` — the single portable stylesheet entry point, exported as `@tt-players/design-system/styles.css`.
- `components/OutcomeBadge.tsx`, `Pill.tsx`, `SegmentedToggle.tsx`, `ExternalLinkButton.tsx` — small semantic controls.
- `theme/ThemeContext.tsx` — theme state only. It reads/writes the configured theme storage key and body classes, but owns no app-specific settings.
- `lib/utils.ts` — canonical shadcn-compatible `cn` helper (`clsx` + `tailwind-merge`). `utils/cx.ts` remains a compatibility alias.

## `MatchRecordRow`

Use `MatchRecordRow` for a compact completed player match or team fixture. Do not use it for standings, rankings, upcoming fixtures, form strips, fixture hero scores, or the detailed two-sided rubber scorecard.

```tsx
import { MatchRecordRow } from '@tt-players/design-system';

<MatchRecordRow
  score={{
    value: '3–1',
    outcome: 'win',
    ariaLabel: 'Won 3 games to 1',
  }}
  title="Lucy Elliott"
  metadata={['County Championships Junior', '11 Apr 2026']}
  onClick={openOpponent}
  actions={[
    {
      iconClassName: 'fa fa-pen',
      label: 'Quick Journal',
      onClick: openJournal,
      tone: 'accent',
    },
    {
      iconClassName: 'fa fa-calendar',
      label: 'View fixture',
      onClick: openFixture,
    },
  ]}
/>
```

The component accepts detailed values such as `3–1`, outcome-only values `W`, `L`, or `D`, and unknown `—`. The consumer must:

- put the relevant player or team score first;
- choose `win`, `loss`, or `neutral`;
- provide a complete spoken `ariaLabel`;
- decide routing and which direct actions are available.

The component deliberately does not parse result strings or know about players, teams, fixtures, tournaments, or journals.

## Legacy compatibility

These components remain exported for older mobile screens, but new work should prefer the current primitives above:

- `AppListGroup` / `AppListItem`
- `AppPlayerList`
- `AppSidebar`
- `AppTabBar`
- `AppCard` / `AppMessageCard`

Legacy components should still follow action semantics: buttons for in-app actions, anchors only for real URLs.

## Reuse rules

1. **No fake links.** Components must not render `href="#"` for actions. Use `<button type="button">` unless a real `href` is supplied.
2. **No feature coupling.** Do not import mobile queries, navigation, storage keys, or page components into this package.
3. **No duplicate semantics.** Use `MatchRecordRow` for compact completed records; do not add a separate W/L badge beside its score. Use `OutcomeBadge` for form and summary indicators, and `Pill` for compact labels.
4. **Token-first styling.** Components emit stable class hooks and rely on the package theme/tokens for visuals. Tailwind utilities are an internal implementation detail. Avoid inline styles except dimensions explicitly passed as props, such as drawer width or sheet height.
5. **Accessible defaults.** Dialogs need `role="dialog"`, `aria-modal`, focus handling, and Escape close. Match scores require complete spoken labels. Status/error states need `role="status"` or `role="alert"`.

## Import pattern

```tsx
import {
  AppButton,
  BottomSheet,
  List,
  ListItem,
  MatchRecordRow,
  OutcomeBadge,
} from '@tt-players/design-system';
```

Mobile code currently re-exports this package via `apps/mobile/src/ui/appkit/index.ts`; direct package imports are preferred for new shared code.

## App setup

Import the package stylesheet once at the application entry point:

```tsx
import '@tt-players/design-system/styles.css';
```

The consuming Vite app enables Tailwind v4 through `@tailwindcss/vite`. Preflight is intentionally not loaded because TT apps own their platform reset and legacy migration boundary.

Advanced compositions may import low-level owned primitives from `@tt-players/design-system/primitives`, but reusable branded UI belongs in this package rather than in each app.

## Package distribution

Inside this monorepo the source package remains `@tt-players/design-system`, and applications should keep a workspace dependency:

```json
{
  "dependencies": {
    "@tt-players/design-system": "workspace:*"
  }
}
```

The compiled package is published to GitHub Packages as `@wudong/tt-players-design-system`. External TT applications configure the GitHub npm registry and install the released package:

```ini
@wudong:registry=https://npm.pkg.github.com
```

```sh
pnpm add @wudong/tt-players-design-system
```

External imports use the published package name:

```tsx
import { AppButton } from '@wudong/tt-players-design-system';
import '@wudong/tt-players-design-system/styles.css';
```

`Design System Package` runs only when `packages/design-system/**` changes. Pull requests build and inspect the package tarball; pushes to `main` publish the version from `packages/design-system/package.json`. Published versions are immutable, so every releasable package change must bump that version.

The architecture and migration audit are documented in `docs/design-system/shadcn-migration.md`. Pull requests that change this package are validated through the design-system guard, mobile build and tests, and the focused responsive screenshot scenario.
