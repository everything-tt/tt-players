# Match Score Tile Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared `MatchRecordRow` score tile `64 × 40px` so scores such as `15–13` remain comfortable on one line across every result list.

**Architecture:** Keep sizing entirely within `packages/design-system/src/components/MatchRecordRow.css`. Extend the existing mobile contract test to lock the shared geometry and no-wrap behavior, allowing every current consumer to inherit the update without page-specific overrides.

**Tech Stack:** React, TypeScript, CSS, Vitest, pnpm monorepo, GitHub Actions.

## Global Constraints

- The score tile must be fixed at `64px` wide and `40px` high.
- The score must remain on one line with `white-space: nowrap`.
- Existing score colors, radius, font size, weight, alignment, actions, and accessible labels remain unchanged.
- Do not add consumer-level score sizing or density-specific geometry.

---

### Task 1: Define the wider score contract

**Files:**
- Modify: `apps/mobile/src/match-record-row.test.tsx`

**Interfaces:**
- Consumes: the existing `MatchRecordRow` render helper and CSS source-contract test.
- Produces: a regression contract requiring `15–13`, `64 × 40px`, and no wrapping.

- [ ] **Step 1: Add the failing score rendering assertion**

Render `15–13` through the existing `renderScore` helper and assert that the complete score is present in the generated markup.

```tsx
it('renders a two-digit team score as one complete value', () => {
  const markup = renderScore('15–13', 'neutral', 'Home 15, Away 13');

  expect(markup).toContain('15–13');
  expect(markup).toContain('Home 15, Away 13');
});
```

- [ ] **Step 2: Replace the old geometry expectations**

Update the CSS contract to require the following exact declarations:

```ts
expect(css).toContain('flex: 0 0 64px;');
expect(css).toContain('height: 40px;');
expect(css).toContain('min-height: 40px;');
expect(css).toContain('width: 64px;');
expect(css).toContain('white-space: nowrap;');
expect(css).toContain('border-radius: var(--radius-sm);');
expect(css).not.toContain('.tt-match-record-row--standard .tt-match-record-score');
```

- [ ] **Step 3: Verify the red state**

Run the pull-request mobile workflow against the test-only commit.

Expected: the focused `MatchRecordRow` contract fails because the CSS still contains `44px` geometry and no `white-space: nowrap` declaration.

- [ ] **Step 4: Commit the failing test**

```bash
git add apps/mobile/src/match-record-row.test.tsx
git commit -m "test: require wider match score tile"
```

### Task 2: Implement the shared design-system geometry

**Files:**
- Modify: `packages/design-system/src/components/MatchRecordRow.css`

**Interfaces:**
- Consumes: the Task 1 CSS contract.
- Produces: one shared score tile presentation inherited by all `MatchRecordRow` consumers.

- [ ] **Step 1: Apply the minimal CSS change**

Change only the score geometry and no-wrap behavior:

```css
.tt-match-record-score {
  flex: 0 0 64px;
  height: 40px;
  min-height: 40px;
  white-space: nowrap;
  width: 64px;
}
```

Preserve every other declaration in the rule.

- [ ] **Step 2: Verify the green state**

Run the focused mobile test and the repository pull-request checks.

Expected: the `MatchRecordRow` contract, complete mobile test suite, design-system usage check, and production mobile build all pass.

- [ ] **Step 3: Inspect the final diff**

Confirm the only production change is the shared design-system CSS and no application consumer contains a score-size override.

- [ ] **Step 4: Commit the implementation**

```bash
git add packages/design-system/src/components/MatchRecordRow.css
git commit -m "style: widen shared match score tile"
```

### Task 3: Complete pull-request verification

**Files:**
- Review: all changed files on `design/widen-match-score-tile`

**Interfaces:**
- Consumes: the passing branch from Tasks 1 and 2.
- Produces: a review-ready pull request into `main`.

- [ ] **Step 1: Confirm branch base and scope**

Compare `main...design/widen-match-score-tile` and confirm the branch contains only the approved design document, implementation plan, test contract, and shared CSS update.

- [ ] **Step 2: Confirm CI status**

Check the head commit’s combined status and workflow runs. All required checks must be successful before marking the pull request ready.

- [ ] **Step 3: Update the pull-request summary**

Document the `44 × 44px` to `64 × 40px` change, the `15–13` regression coverage, and the app-wide inheritance through `MatchRecordRow`.
