# Section Header Hierarchy Implementation Plan

**Goal:** Give `PageSection` explicit title-description-metadata hierarchy, remove the default decorative accent bar, and migrate H2H as the first consumer.

## Files

- `packages/design-system/src/components/States.tsx`: extend `SectionHeader` semantics.
- `packages/design-system/src/components/PageSection.tsx`: expose description, metadata and emphasis.
- `packages/design-system/src/components/design-system-contract.test.tsx`: cover the new DOM contract and backwards compatibility.
- `packages/design-system/src/styles/primitives.css`: make the canonical section-header layout authoritative.
- `apps/mobile/src/density-pass.css`: stop overriding canonical section-header typography.
- `apps/mobile/src/uncarded-density.css`: stop overriding canonical section-header spacing.
- `apps/mobile/src/H2HTabContent.tsx`: migrate selection and saved sections.
- `apps/mobile/src/components/RatingPredictionPanel.tsx`: migrate H2H verdict and evidence sections.
- `docs/design-system/usage.md`: document the new API and hierarchy.

## Tasks

- [x] Add design-system contract tests for description, metadata, action and emphasis.
- [x] Implement the new API while retaining `note` as a compatibility alias.
- [x] Replace the accent-bar layout with copy and trailing regions.
- [x] Remove app-level overrides that compete with canonical header styles.
- [x] Migrate H2H to primary, standard and secondary section emphasis.
- [x] Update the component catalogue and design-system guidance.
- [ ] Run design-system tests, mobile typecheck/build and usage checks in CI.
- [ ] Review primary and secondary headers at narrow mobile widths.