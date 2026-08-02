# Full-page league scope picker design

## Goal

Replace the cramped 72% league bottom sheet with a responsive full-page modal that remains usable with the mobile keyboard open, follows the TT Players design system, and prevents search text from being dropped or reset while typing.

## Presentation

The shared design-system `BottomSheet` gains a `presentation="page"` variant rather than introducing a second modal implementation. The page variant reuses the existing portal, focus trap, Escape handling, scroll lock, safe-area support, and focus restoration.

On phones the dialog occupies the visual viewport (`100dvh`) with a fixed header, independently scrollable body, and fixed action footer. On wider screens it becomes a large centred dialog with bounded width and height. The page variant removes the drag handle and bottom-sheet slide affordance because it is no longer a transient sheet.

## League picker structure

- Header title: **League scope**. Remove the duplicated eyebrow/title treatment.
- Supporting copy: “Choose the leagues and areas included across Players, Leagues and Home.”
- Sticky controls: design-system search treatment followed by the existing `SegmentedToggle` for Selected, Leagues, and Areas.
- Scrollable content: existing design-system `List`, `ListItem`, `Checkbox`, loading, error, and empty-state components.
- Footer: selected-count summary and a single primary **Done** action. Selection remains live, matching existing persistence and callback behaviour; introducing draft Apply/Cancel semantics is out of scope.

## Search behaviour

The input owns immediate local text state. Filtering uses `useDeferredValue(query)` so rendering a long league list cannot block or revert Android keyboard input. The query is not cleared when switching tabs; this preserves user intent and avoids surprising resets. Empty-query league view becomes browseable rather than showing an instruction-only empty state.

Search matches league names, season labels, and region labels. Area search matches area names. A clear button remains available and has an accessible name.

## Usability and accessibility

- Minimum 44px targets for close, clear-search, tabs, row actions, and footer action.
- Modal keeps `role="dialog"`, `aria-modal`, labelled title, focus trap, Escape handling, and focus restoration.
- Header and footer remain visible while content scrolls.
- The primary action is disabled when onboarding requires at least one league and none is selected.
- Selection-limit feedback is shown near the footer and non-selected rows remain disabled at the limit.
- No horizontal overflow at 360px and 390px widths.

## Verification

- Design-system contract test for page presentation, description, and footer slots.
- League picker contract/behaviour tests for the full-page variant, persistent multi-character query, browseable empty-query league list, and Done action.
- Focused Playwright UI-review scenario that opens the picker, types at least three characters, verifies the input value and filtered result, checks viewport geometry and sticky regions, and captures Selected, Leagues, and Areas views.
