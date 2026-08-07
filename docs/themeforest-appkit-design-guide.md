# ThemeForest AppKit Design Guide (TT Players)

This project already uses AppKit CSS/assets in `apps/mobile/public/appkit`.
Use this guide to quickly find the right demo file before implementing UI in `apps/mobile/src`.

## Quick Start

1. Start from `themeforest-66sQLgw3-appkit-mobile/code/index-pages.html` (page packs).
2. For reusable building blocks, use `code/index-components.html`.
3. For home shell options, use `code/index-homepages.html`.
4. For gallery/portfolio patterns, use `code/index-projects.html`.

## Fast Lookup

Run:

```bash
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "<keyword>"
```

Examples:

```bash
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh checkout
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh profile
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh toast
```

## Core Layout Rules

- Keep normal content inside `.page-content`.
- Keep off-canvas elements outside `.page-content` and inside `#page`:
  - menus/sidebars
  - action sheets/modals
  - toasts/snackbars
  - header/footer bars
- Default content block is `.card.card-style > .content`.

## Reusable Library in This Repo

Use the React primitives in `apps/mobile/src/ui/appkit` before writing raw AppKit markup:

- `AppShellPage`, `AppHeader`, `AppHeaderSpacer`, `AppPageContent`
- `AppCard`, `AppCardContent`, `AppLoadingCard`, `AppMessageCard`
- `AppButtonLink`
- `AppListGroup`, `AppListItem`

## Which Page Pack to Open First

- Auth/OTP/error: `list-system.html`
- Dashboards and general app pages: `list-multipurpose.html`
- Store/cart/checkout: `list-commerce.html`
- Food ordering: `list-food.html`
- Grocery flows: `list-grocery.html`
- Articles/news/blog: `list-content.html`
- Events/calendar: `list-events.html`
- Travel: `list-travel.html`
- Health: `list-health.html`
- Tasks/productivity: `list-tasks.html`
- Onboarding/splash: `list-starters.html`

## Detailed Reference Files

- `.agents/skills/appkit-template-reference/references/design-guideline.md`
- `.agents/skills/appkit-template-reference/references/page-pack-index.tsv`
- `.agents/skills/appkit-template-reference/references/component-index.tsv`
- `.agents/skills/appkit-template-reference/references/homepage-index.tsv`
- `.agents/skills/appkit-template-reference/references/project-index.tsv`
