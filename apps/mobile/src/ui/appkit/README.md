# AppKit Component Library (Mobile)

Reusable React primitives built on top of AppKit classes for `apps/mobile`.

## Components

- `AppShellPage`: wraps `#page` root shell.
- `AppHeader`: fixed AppKit header with typed left/right icon actions.
- `AppHeaderSpacer`: inserts header-clear spacer (`small|medium|large`).
- `AppPageContent`: wraps the canonical main content area (`page-content tt-page-content`); header/footer/safe-area clearance stays design-system-owned.
- `AppCard`: base `card card-style` container.
- `AppCardContent`: standard `content` slot.
- `AppLoadingCard`: card with AppKit loading spinner + text.
- `AppMessageCard`: card for empty/error/info states with optional action.
- `AppButtonLink`: normalized AppKit button styles (`tone`, `size`, `full`).
- `AppListGroup`: `list-group` wrapper (`small|large`).
- `AppListItem`: standard list row with icon/title/subtitle/trailing icon.

## Usage Example

```tsx
import {
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  AppCard,
  AppCardContent,
  AppButtonLink,
  AppListGroup,
  AppListItem,
} from './ui/appkit';

<AppShellPage>
  <AppHeader
    title="Player"
    onTitleClick={goHome}
    leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
    rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
  />
  <AppHeaderSpacer />
  <AppPageContent>
    <AppCard>
      <AppCardContent>
        <AppButtonLink full size="sm">Save</AppButtonLink>
      </AppCardContent>
    </AppCard>
    <AppListGroup size="large">
      <AppListItem iconClassName="fa fa-check rounded-xl bg-green-dark color-white" title="Win" subtitle="Today" />
    </AppListGroup>
  </AppPageContent>
</AppShellPage>
```

## Template Alignment

To find matching AppKit demos before implementing a new screen or pattern:

```bash
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "<keyword>"
```

