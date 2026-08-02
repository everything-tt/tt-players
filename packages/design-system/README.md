# TT Players Design System

Reusable React primitives for TT Players mobile surfaces. Components are intentionally app-shell aware, but they should stay portable: no feature data fetching, no route knowledge, and no direct product state ownership.

## Module boundaries

- `components/AppButton.tsx` — canonical button primitives. Use `AppButton` for actions; keep `AppButtonLink` only for true link-styled navigation.
- `components/List.tsx` — current generic list primitive with slots (`leading`, `title`, `subtitle`, `trailing`). Prefer this over legacy row components for ordinary new lists.
- `components/MatchRecordRow.tsx` — canonical compact completed-result row. It owns the leading score tile, title/metadata hierarchy, primary row action, and zero to two direct secondary actions. Consumers provide an already-oriented score model and all business behaviour.
- `components/States.tsx` — `HeroCard`, `SectionHeader`, `EmptyState`, `ErrorState`.
- `components/BottomSheet.tsx` and `components/AppDrawer.tsx` — overlay primitives with dialog semantics and focus management.
- `components/OutcomeBadge.tsx`, `Pill.tsx`, `SegmentedToggle.tsx`, `ExternalLinkButton.tsx` — small semantic controls.
- `theme/ThemeContext.tsx` — theme state only. It reads/writes the configured theme storage key and body classes, but owns no app-specific settings.
- `utils/cx.ts` — class name composition.

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
4. **Token-first styling.** Components emit stable class hooks and rely on app tokens/CSS for visuals. Avoid inline styles except dimensions explicitly passed as props, such as drawer width or sheet height.
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
