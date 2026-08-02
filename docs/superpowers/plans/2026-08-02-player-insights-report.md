# Player Insights Design-System Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement the Player Insights mobile page so it retains the approved information while matching the established TT Players design system: flat sections, compact shared metrics, standard lists, and minimal custom geometry.

**Architecture:** Keep the existing rival API and pure insight view models. Recompose the mobile page from exported design-system primitives (`PageSection`, `MetricGrid`, `SegmentedToggle`, `DesignList`, `ListItem`, `DesignAvatar`, `Pill`, and state components), then reduce `player-insights.css` to chart-specific and responsive alignment only. Use the focused Playwright scenario as the visual contract for the absence of nested cards and narrow-screen overflow.

**Tech Stack:** TypeScript, React 18, TanStack Query, TT Players design system, Vitest, Playwright, CSS semantic tokens.

## Global Constraints

- Singles records only; do not present doubles analysis.
- Keep the existing rating-history chart behaviour, range controls, point selection, confidence band, and keyboard interaction.
- Keep at most four rivals per category and retain the existing H2H navigation.
- Use one continuous page surface with flat sections and hairline separation.
- Do not introduce section shadows, elevated card shells, nested cards, decorative category tiles, or custom season progress bars.
- Use shared design-system components before page-specific markup.
- Custom CSS is limited to chart geometry, compact alignment, and responsive behaviour that shared primitives cannot express.
- Verify no horizontal overflow at 390px and 360px.

---

### Task 1: Define the design-system UI contract

**Files:**
- Modify: `apps/mobile/tests/ui-review/zz-player-insights-report.pw.ts`

**Interfaces:**
- Consumes: rendered Player Insights DOM.
- Produces: assertions that reject the old card-heavy class structure and verify canonical section/list/metric structures.

- [ ] **Step 1: Replace old card assertions with the new contract**

Add assertions equivalent to:

```ts
await expect(page.locator('.tt-insights-card')).toHaveCount(0);
await expect(page.locator('.tt-rivals-panel')).toHaveCount(0);
await expect(page.locator('.tt-career-highlight')).toHaveCount(0);
await expect(page.locator('.tt-career-table')).toHaveCount(0);
await expect(page.locator('.tt-insights-page .tt-section')).toHaveCount(4);
await expect(page.getByLabel('Insights summary metrics').locator('.tt-metric')).toHaveCount(4);
```

For rivals, assert the shared list exposes buttons named for the mocked opponents. For career, assert the shared metric grid has four metrics and at least one informational season row without an interactive chevron.

- [ ] **Step 2: Push the test-only change and verify it fails**

Expected failure: old `.tt-insights-card`, `.tt-rivals-panel`, `.tt-career-highlight`, or `.tt-career-table` elements still exist, and canonical `.tt-section`/`.tt-metric` counts do not match.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/tests/ui-review/zz-player-insights-report.pw.ts
git commit -m "test: require design-system player insights layout"
```

### Task 2: Recompose summary and career with shared primitives

**Files:**
- Modify: `apps/mobile/src/components/PlayerInsightsSummary.tsx`
- Modify: `apps/mobile/src/components/PlayerCareerStory.tsx`

**Interfaces:**
- Consumes: `ExtendedPlayerStats`, `PlayerInsightsReport`, existing model formatters.
- Produces: flat `PageSection` components with canonical `MetricGrid` and `DesignList` output.

- [ ] **Step 1: Rebuild the summary**

Use this component structure:

```tsx
<PageSection
  surface="flat"
  density="compact"
  title="Insights Summary"
  description="The headline view of form and career performance."
>
  <MetricGrid
    ariaLabel="Insights summary metrics"
    columns={4}
    density="compact"
    metrics={[
      { label: 'Overall WR', value: `${winRate}%`, hint: `${stats.wins} wins from ${stats.total}` },
      { label: 'Current form', value: momentumLabel(momentum), hint: `Last ${recentCount} matches` },
      { label: 'Matches', value: stats.total.toLocaleString('en-GB'), hint: activeYearsCopy },
      { label: 'Best season', value: bestSeason?.year ?? '—', hint: bestSeasonCopy },
    ]}
  />
  <p className="tt-insights-takeaway">{takeaway}</p>
</PageSection>
```

Do not use custom metric articles, icons, or semantic colour for neutral category decoration.

- [ ] **Step 2: Rebuild Career Story**

Use `PageSection`, one four-item `MetricGrid`, and `DesignList`/`ListItem` season rows. Build each subtitle as:

```ts
`${year.played} played · ${year.win_rate}% win rate · ${year.wins}W–${year.losses}L`
```

Use an optional neutral/accent `Pill` trailing element only when `year.year === insights.peaks.best_season?.year`. Set `hideChevron` for informational rows.

- [ ] **Step 3: Run focused model tests and mobile typecheck/build**

Expected: existing formatter/model tests remain green; no component-specific data contract changes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/PlayerInsightsSummary.tsx apps/mobile/src/components/PlayerCareerStory.tsx
git commit -m "refactor: use shared metrics and lists for insights"
```

### Task 3: Recompose rival intelligence and rating summary

**Files:**
- Modify: `apps/mobile/src/components/PlayerRivalIntelligence.tsx`
- Modify: `apps/mobile/src/components/PlayerRatingHistoryChart.tsx`

**Interfaces:**
- Consumes: existing rival response/types and rating-history summary.
- Produces: flat sections with shared segmented control, shared list rows, and shared metric grid.

- [ ] **Step 1: Replace the rival panel**

Use `PageSection` with title/description, followed by `SegmentedToggle`, category helper text, and a direct `DesignList density="compact" divider="hairline"`.

Each opponent uses:

```tsx
<ListItem
  leading={<DesignAvatar size="compact" text={getInitials(item.opponent_name)} />}
  title={item.opponent_name}
  subtitle={subtitle}
  trailing={<span className="tt-rival-stat"><strong>{value}</strong><small>{label}</small></span>}
  onClick={() => onOpenOpponent(item.opponent_id)}
/>
```

Use shared `EmptyState`/`ErrorState` or compact neutral state copy rather than a custom bordered inner panel.

- [ ] **Step 2: Replace boxed rating metrics**

Import `MetricGrid` and render current, peak, and range change as one compact canonical metric grid. Preserve the existing chart, filters, result pills, selected-week detail, range state, and keyboard handlers.

- [ ] **Step 3: Run mobile tests/build and design-system usage check**

Expected: no type errors; existing chart summary tests pass; design-system check accepts shared components.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/PlayerRivalIntelligence.tsx apps/mobile/src/components/PlayerRatingHistoryChart.tsx
git commit -m "refactor: flatten rating and rival insight sections"
```

### Task 4: Flatten the page shell and remove obsolete geometry

**Files:**
- Modify: `apps/mobile/src/PlayerInsightsPage.tsx`
- Modify: `apps/mobile/src/player-insights.css`
- Delete: `apps/mobile/src/player-insights-progress.css`

**Interfaces:**
- Consumes: four `PageSection`-based feature components.
- Produces: a continuous page matching Player Profile spacing and dividers.

- [ ] **Step 1: Use the canonical page container**

Replace the custom nested `div.page-content` with `AppPageContent` and a simple `Stack` or `.tt-insights-page` wrapper. Remove the progress stylesheet import.

Skeleton sections must be flat and should not use `.tt-insights-card`.

- [ ] **Step 2: Reduce CSS**

Delete all rules for:

```text
.tt-insights-card
.tt-insights-metric
.tt-rivals-panel*
.tt-rival-row
.tt-rival-avatar
.tt-career-highlight*
.tt-career-table*
.tt-career-rate-track
```

Retain only layout rules needed for the takeaway, rating toolbar/chart/detail, rival trailing statistic, section spacing, and 360px responsive wrapping. No box shadow or large section border radius may remain in `player-insights.css`.

- [ ] **Step 3: Delete the obsolete progress stylesheet**

Remove `player-insights-progress.css` and confirm no imports or class references remain.

- [ ] **Step 4: Run mobile tests/build and Playwright collection**

Expected: compilation succeeds and the focused scenario is collected.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/PlayerInsightsPage.tsx apps/mobile/src/player-insights.css apps/mobile/src/player-insights-progress.css
git commit -m "style: align player insights with flat page sections"
```

### Task 5: Visual verification and PR completion

**Files:**
- Modify if diagnostics require it: `apps/mobile/tests/ui-review/zz-player-insights-report.pw.ts`
- Modify: PR #89 description.

**Interfaces:**
- Produces: passing mobile/API CI, updated Netlify preview, and refreshed screenshots for summary/rating, rivals, and narrow career story.

- [ ] **Step 1: Run/inspect CI for the final head SHA**

Required checks:

```text
Mobile CI
Backend CI
Build and Deploy Frontend
focused Playwright UI review
```

- [ ] **Step 2: Inspect all three screenshots**

Confirm flat section dividers, compact metrics, standard rival rows, informational career rows, correct 360px wrapping, and no horizontal overflow.

- [ ] **Step 3: Review the diff**

Check for unsupported claims, misleading interactive affordances, duplicated data, obsolete CSS selectors, and any new generic component that should not exist.

- [ ] **Step 4: Update PR #89**

Describe the retained data improvements, the design-system reimplementation, and exact verification evidence. Keep the PR open and ready for human review.
