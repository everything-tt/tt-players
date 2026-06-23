---
name: appkit-template-reference
description: Navigate and apply the ThemeForest AppKit Mobile template in this repository. Use when implementing or redesigning UI in `apps/mobile` and you need to quickly find the right demo page/component, map user intent to template files, and follow AppKit structure rules (page-content vs off-canvas, card patterns, menus, and theme/highlight usage).
---

# AppKit Template Reference

## Overview

Use this skill to choose the right AppKit sample before coding, then port only the needed patterns into React components in `apps/mobile/src`.

## Workflow

1. Identify intent:
- page flow (auth, profile, dashboard, commerce, onboarding)
- component pattern (tabs, toast, cards, accordions, menu)

2. Query the indexes first:
- `references/design-guideline.md` for quick decisions and architecture rules.
- `references/page-pack-index.tsv` for page samples by pack.
- `references/component-index.tsv` for component demos.
- `references/homepage-index.tsv` for starter home layouts.
- `references/project-index.tsv` for gallery/portfolio samples.

3. Use keyword lookup:
- `bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "<keyword>"`
- Example: `bash .agents/skills/appkit-template-reference/scripts/find-appkit-template.sh "checkout"`

4. Open the exact HTML sample in `themeforest-66sQLgw3-appkit-mobile/code/` and copy only the relevant structure.

5. Implement in React (`apps/mobile/src/*.tsx`) using existing AppKit classes loaded from `apps/mobile/public/appkit/styles/`.

6. Enforce placement rules:
- Keep normal content inside `.page-content`.
- Keep off-canvas elements (menus/modals/toasts/snackbars/action sheets) outside `.page-content` and under `#page`.

## Repository-Specific Notes

- Runtime AppKit assets for the mobile app are in `apps/mobile/public/appkit`.
- Source demo HTML files are in `themeforest-66sQLgw3-appkit-mobile/code`.
- Detailed vendor docs are in `themeforest-66sQLgw3-appkit-mobile/documentation`.
- Prefer `code/` for LTR and `code-rtl/` only when RTL layout is explicitly requested.
- Do not edit vendor template files unless the task is specifically to update the vendored theme.

