# Mobile UI Polish Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first independently deployable TT Players UI/UX polish slice by standardising the mobile shell, header, tab bar, cards, state actions, spacing, safe areas, and native interaction feedback without redesigning individual product journeys.

**Architecture:** Keep `packages/design-system` as the semantic component source of truth and add canonical `tt-*` classes to its existing primitives. Add one isolated app-level polish stylesheet loaded after the legacy AppKit shell so the migration is reversible and does not require rewriting the existing stylesheet. Refactor the product tab footer to consume the shared `AppTabBar`, then protect the new contracts with server-rendered component tests.

**Tech Stack:** React 18, TypeScript 5.7, React DOM server rendering, Vitest 3, Vite 6, CSS custom properties, existing AppKit compatibility layer.

## Global Constraints

- Preserve the existing five-tab application structure and current journeys.
- Preserve the current green/orange brand character and information density.
- Use a platform-neutral branded visual system with native mobile behaviour.
- Keep common touch targets at least `44px`.
- Handle top and bottom safe areas with `env(safe-area-inset-*)`.
- Keep light and dark themes equivalent in quality.
- Respect `prefers-reduced-motion`.
- Do not add new runtime dependencies.
- Do not rewrite all AppKit CSS in this change.
- Keep the PR independently deployable and limited to shared foundations.

---

### Task 1: Lock the semantic component contracts with failing tests

**Files:**
- Create: `apps/mobile/src/ui-primitives.test.tsx`

**Interfaces:**
- Consumes: `AppHeader`, `AppPageContent`, `AppTabBar`, `EmptyState`, and `AppMessageCard` from `./ui/appkit`.
- Produces: regression coverage for canonical classes, tab semantics, and real button actions.

- [ ] **Step 1: Write the failing tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppHeader,
  AppMessageCard,
  AppPageContent,
  AppTabBar,
  EmptyState,
} from './ui/appkit';

describe('mobile UI primitive contracts', () => {
  it('marks page content and headers with canonical polish classes', () => {
    const content = renderToStaticMarkup(<AppPageContent>Content</AppPageContent>);
    const header = renderToStaticMarkup(<AppHeader title="Players" />);

    expect(content).toContain('tt-page-content');
    expect(header).toContain('tt-app-header');
    expect(header).toContain('tt-app-header__title');
  });

  it('announces the selected tab and labels primary navigation', () => {
    const markup = renderToStaticMarkup(
      <AppTabBar
        items={[
          { id: 'home', label: 'Home', iconClassName: 'fa fa-home' },
          { id: 'players', label: 'Players', iconClassName: 'fa fa-users' },
        ]}
        activeItemId="players"
        onItemClick={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('tt-tab-bar__item--active');
  });

  it('renders empty and message actions as buttons rather than anchor actions', () => {
    const empty = renderToStaticMarkup(
      <EmptyState title="No players" action={{ label: 'Retry', onClick: () => undefined }} />,
    );
    const message = renderToStaticMarkup(
      <AppMessageCard message="Offline" action={{ label: 'Retry', onClick: () => undefined }} />,
    );

    expect(empty).toContain('<button');
    expect(empty).not.toContain('<a');
    expect(message).toContain('<button');
    expect(message).not.toContain('<a');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @tt-players/mobile test -- ui-primitives.test.tsx`

Expected: failures because canonical shell/tab classes and button-based state actions do not yet exist.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/mobile/src/ui-primitives.test.tsx
git commit -m "test: define mobile UI primitive contracts"
```

### Task 2: Add canonical semantic classes to shared primitives

**Files:**
- Modify: `packages/design-system/src/components/AppShell.tsx`
- Modify: `packages/design-system/src/components/AppTabBar.tsx`
- Modify: `packages/design-system/src/components/AppCard.tsx`
- Modify: `packages/design-system/src/components/States.tsx`

**Interfaces:**
- Produces: `tt-app-shell`, `tt-page-content`, `tt-app-header`, `tt-app-header__title`, `tt-app-header__action`, `tt-tab-bar`, `tt-tab-bar__item`, `tt-tab-bar__item--active`, `tt-card`, `tt-card__content`, and shared `tt-state` classes.
- Preserves: all existing legacy AppKit classes for compatibility.

- [ ] **Step 1: Update `AppShell` without removing compatibility classes**

Use `cx()` so `AppShellPage`, `AppPageContent`, `AppHeader`, header titles, and header actions emit both existing AppKit classes and the new canonical classes. Add `aria-label="Application header"` to the header when no more specific label is supplied.

- [ ] **Step 2: Update `AppTabBar` semantics**

Add an optional `ariaLabel?: string` prop defaulting to `Primary navigation`. Emit canonical classes and `aria-current="page"` on the selected button while preserving `active-nav`.

```tsx
<nav id={id} className={cx('footer-bar-3', 'tt-tab-bar', className)} aria-label={ariaLabel}>
  <button
    className={cx('tt-tab-bar__item', selected && 'active-nav tt-tab-bar__item--active')}
    aria-current={selected ? 'page' : undefined}
  >
```

- [ ] **Step 3: Update cards and state actions**

Add `tt-card` and `tt-card__content` alongside legacy classes. Change `AppMessageCardAction.onClick` to `MouseEventHandler<HTMLButtonElement>` and render `AppButton`. Change `EmptyState` and `ErrorState` actions to `AppButton`. Add shared `tt-state`, `tt-state--empty`, and `tt-state--error` classes without changing visible copy.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @tt-players/mobile test -- ui-primitives.test.tsx`

Expected: all three tests pass.

- [ ] **Step 5: Run TypeScript build**

Run: `pnpm --filter @tt-players/mobile build`

Expected: build succeeds; fix any action callback type errors by changing callers to button-event handlers or zero-argument callbacks.

- [ ] **Step 6: Commit**

```bash
git add packages/design-system/src/components/AppShell.tsx \
  packages/design-system/src/components/AppTabBar.tsx \
  packages/design-system/src/components/AppCard.tsx \
  packages/design-system/src/components/States.tsx
git commit -m "refactor: standardise mobile UI primitives"
```

### Task 3: Route product navigation through the shared tab bar

**Files:**
- Modify: `apps/mobile/src/TabFooterBar.tsx`

**Interfaces:**
- Consumes: `AppTabBar`, `TAB_METADATA`, and `useTabNavigation`.
- Produces: one footer implementation for both product and design-system semantics.

- [ ] **Step 1: Replace hand-written footer markup**

Build the item array from `FOOTER_TABS` and `TAB_METADATA`, then render:

```tsx
<AppTabBar
  items={FOOTER_TABS.map((tabId) => ({
    id: tabId,
    label: TAB_METADATA[tabId].label,
    iconClassName: TAB_METADATA[tabId].icon,
  }))}
  activeItemId={activeTab}
  onItemClick={(id) => switchTab(id as AppTabId, reselectBehavior)}
/>
```

Keep `FOOTER_TABS` and About’s menu-only behaviour unchanged.

- [ ] **Step 2: Run focused and full mobile tests**

Run: `pnpm --filter @tt-players/mobile test -- ui-primitives.test.tsx`

Run: `pnpm --filter @tt-players/mobile test`

Expected: all mobile tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/TabFooterBar.tsx
git commit -m "refactor: share the primary mobile tab bar"
```

### Task 4: Add the isolated native polish layer

**Files:**
- Create: `apps/mobile/src/mobile-polish.css`
- Modify: `apps/mobile/src/App.tsx`

**Interfaces:**
- Consumes: canonical classes from Tasks 2 and 3 and existing theme variables.
- Produces: final spacing, surface, safe-area, tab, header, card, state, pressed, and reduced-motion treatment.

- [ ] **Step 1: Import the stylesheet after existing shell styles**

At the top of `App.tsx`, keep the current imports and add:

```ts
import './app-shell.css';
import './root-shell.css';
import './mobile-polish.css';
```

- [ ] **Step 2: Define the foundation tokens**

Create `mobile-polish.css` with a documented token block including:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --page-gutter: clamp(14px, 4vw, 20px);
  --content-max: 760px;
  --header-height: 56px;
  --tab-bar-height: 62px;
  --surface-raised: color-mix(in oklch, var(--surface-strong) 94%, var(--canvas-parchment));
  --shadow-card: 0 1px 2px oklch(21% 0.034 158 / 0.05), 0 10px 28px oklch(21% 0.034 158 / 0.06);
  --motion-fast: 120ms;
  --motion-standard: 180ms;
  --ease-native: cubic-bezier(0.2, 0, 0, 1);
}
```

Add dark-theme shadow/surface tuning without changing brand colours.

- [ ] **Step 3: Style the canonical shell and header**

Make `.tt-page-content` use one responsive gutter, centred content width, top flow spacing, and bottom clearance for the tab bar and safe area. Make `.tt-app-header` use safe-area top padding, translucent surface, hairline divider, native-height actions, and a stable ellipsised title. Do not change routing or header action order.

- [ ] **Step 4: Style the canonical tab bar**

Give `.tt-tab-bar` safe-area bottom padding and a stable height. Use an accent-tinted icon capsule or indicator only for the active item, keep inactive labels calm, and preserve five equal-width targets. Ensure all items remain at least `44px` tall.

- [ ] **Step 5: Style cards and states**

Use one raised surface, border, radius, and restrained shadow for `.tt-card`. Normalise `.tt-card__content` padding. Give `.tt-state` comfortable vertical rhythm and keep actions full-width only on narrow phones.

- [ ] **Step 6: Align existing root header and interaction feedback**

Override root-header geometry using the same spacing, radius, surface, motion, and safe-area tokens. Add hover rules only inside `@media (hover: hover)`. Add pressed scaling/background feedback for canonical buttons and navigation without causing layout movement.

- [ ] **Step 7: Add narrow-device and reduced-motion rules**

At `max-width: 360px`, reduce only nonessential horizontal gaps and title size. Under `prefers-reduced-motion: reduce`, remove transforms and transitions from the new layer.

- [ ] **Step 8: Run build and tests**

Run: `pnpm --filter @tt-players/mobile test`

Run: `pnpm --filter @tt-players/mobile build`

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/mobile-polish.css apps/mobile/src/App.tsx
git commit -m "style: add native mobile polish foundations"
```

### Task 5: Review, document, and prepare the pull request

**Files:**
- Modify if findings require: files changed in Tasks 1-4 only.

**Interfaces:**
- Produces: a reviewed branch and draft PR against `main`.

- [ ] **Step 1: Review branch scope**

Run: `git diff --stat main...HEAD`

Run: `git diff main...HEAD -- apps/mobile packages/design-system docs/superpowers`

Confirm there are no backend, data-model, route, or feature changes.

- [ ] **Step 2: Run final verification**

Run: `pnpm --filter @tt-players/mobile test`

Run: `pnpm --filter @tt-players/mobile build`

Expected: all tests and build pass with no warnings introduced by this change.

- [ ] **Step 3: Check the device contract manually or through preview artifacts**

Review at `320px`, `360-412px`, and a large-phone width in both themes. Verify safe-area clearance, no horizontal overflow, 44px targets, header/title truncation, tab selection, state actions, and reduced-motion behaviour.

- [ ] **Step 4: Open a draft PR**

Title: `Polish shared mobile UI foundations`

Body must explain:

- this is the first focused slice of the approved evolutionary UI/UX polish;
- canonical design-system classes and semantic action fixes;
- shared tab-bar migration;
- native safe-area, spacing, surface, header, card, state, and interaction polish;
- tests and build validation;
- explicit non-goals and remaining screen-specific phases.
