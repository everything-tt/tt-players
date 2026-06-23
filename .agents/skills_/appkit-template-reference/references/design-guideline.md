# AppKit Design Guideline (Project Reference)

## 1. Canonical Locations

- Source template demos: `themeforest-66sQLgw3-appkit-mobile/code/`
- RTL demos (only if needed): `themeforest-66sQLgw3-appkit-mobile/code-rtl/`
- Vendor documentation: `themeforest-66sQLgw3-appkit-mobile/documentation/`
- Runtime assets used by app: `apps/mobile/public/appkit/`
- React implementation target: `apps/mobile/src/`

## 2. Core AppKit Layout Rules (must follow)

- Use `#page` as the outer wrapper.
- Keep normal UI inside `.page-content`.
- Keep off-canvas UI outside `.page-content` and inside `#page`:
  - header/footer bars
  - menus/sidebars
  - action sheets/modals
  - toasts/snackbars
- Default content container pattern is `.card.card-style > .content`.
- Theme mode is body class driven (`theme-light`, `theme-dark`, `detect-theme`).
- Highlight colors are switched via highlight CSS files (already wired in `apps/mobile/src/main.tsx`).

## 3. First-Pass File Selection

Use this table before exploring the full index.

| UI need | Start here |
|---|---|
| Landing/home shell | `index-homepages.html`, then `references/homepage-index.tsv` |
| Generic app pages | `list-multipurpose.html` |
| Auth / OTP / error / coming soon | `list-system.html` |
| Shop/cart/checkout | `list-commerce.html` |
| Food ordering | `list-food.html` |
| Grocery flows | `list-grocery.html` |
| News/content/article pages | `list-content.html` |
| Finance/wallet/billing | `list-finance.html` |
| Events/calendar/schedule | `list-events.html` |
| Tasks/productivity | `list-tasks.html` |
| Travel listing/article/cart | `list-travel.html` |
| Health/medical services | `list-health.html` |
| Pets/vet pages | `list-pets.html` |
| Social profile/post layouts | `list-socials.html` |
| Onboarding/splash/walkthrough | `list-starters.html` |
| Navigation styles | `list-navigations.html` |
| Form stepper flows | `list-form-wizard.html` |
| Galleries/portfolio | `index-projects.html` + `references/project-index.tsv` |
| Reusable UI primitives | `index-components.html` + `references/component-index.tsv` |

## 4. Recommended Component Entry Points

- Alerts/toasts/snackbars: `component-notifications-alerts.html`, `component-toasts.html`, `component-snackbars.html`
- Menus and off-canvas: `component-action-sheets.html`, `component-action-modals.html`, `component-headers.html`, `component-footers.html`
- Content grouping: `component-card-content.html`, `component-list-groups.html`, `component-columns.html`, `component-collapse.html`, `component-accordions.html`
- Forms/input: `component-inputs.html`, `component-buttons.html`, `component-file-upload.html`, `component-search.html`
- Data display: `component-tables.html`, `component-tabs.html`, `component-pagination.html`, `component-progress-bars.html`, `component-charts.html`, `component-graphs.html`
- Utility UX: `component-offline-detection.html`, `component-os-detection.html`, `component-text-sizer.html`, `component-reading-time.html`

## 5. Pack Inventory (from `list-*.html`)

- `multipurpose` (22 pages)
- `pets` (14 pages)
- `system` (14 pages)
- `food` (13 pages)
- `commerce` (12 pages)
- `travel` (12 pages)
- `events` (11 pages)
- `grocery` (11 pages)
- `content` (10 pages)
- `finance` (10 pages)
- `health` (10 pages)
- `photography` (10 pages)
- `starters` (8 pages)
- `education` (7 pages)
- `socials` (7 pages)
- `tasks` (7 pages)
- `navigations` (5 pages)
- `form-wizard` (4 pages)

## 6. Implementation Guidance for This Repo

- Treat template HTML as pattern/reference; port structure into React TSX components.
- Keep existing AppKit class names where practical (`card-style`, `header-fixed`, `list-custom-large`, etc.) because CSS already ships in `apps/mobile/public/appkit`.
- Avoid introducing template JS behaviors unless needed; prefer React-managed state/interaction first.
- If you add AppKit-driven behaviors (menu toggles, etc.), verify they still respect React render lifecycle.

## 7. Known Template Quirks

- `list-bootstrap.html` exists but does not provide concrete page links.
- `index-projects.html` has a duplicated link target for collections (`gallery-wide.html` appears twice).
- Some list pages contain minor text typos; prioritize file names and visual output over labels.

## 8. Fast Search

Use keyword search before manual browsing:

```bash
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "checkout"
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "profile"
bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "toast"
```

