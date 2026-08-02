# Player Match Row Actions Implementation Plan

## Task 1: Define row contracts

Update `apps/mobile/src/player-match-list.test.tsx` to require:

- inline date metadata with a smaller visible year
- main-row opponent navigation semantics
- one fixture/event action for other players
- Quick Journal plus fixture/event actions for the identified player
- no action drawer or overflow trigger

## Task 2: Refactor the shared row

Update `apps/mobile/src/components/PlayerMatchList.tsx`:

- remove `ActionMenu` usage
- remove the leading date capsule
- render `DD Mon`, a smaller `YYYY`, and the source label in the subtitle
- make the main row open the opponent profile
- render direct Quick Journal and fixture/event buttons according to identity state
- keep fixture/event access when no opponent profile exists

## Task 3: Refine visual density

Update `apps/mobile/src/components/PlayerMatchList.css`:

- remove date-card styling
- constrain metadata to one truncating line
- keep the year smaller but legible
- style direct action buttons as compact design-system controls
- preserve mobile touch targets and focus indicators

## Task 4: Focused UI verification

Add `apps/mobile/tests/ui-review/zz-player-match-row-actions.pw.ts` and select it in `playwright.ui-review.config.ts`.

Verify:

- date capsule is absent and year is visually smaller
- my-player rows expose two direct actions
- other-player rows expose one direct action
- row tap opens the opponent profile
- Quick Journal remains correctly prefilled
- screenshots are captured for both identity states and the journal flow

## Task 5: Integration

Open a pull request against `main`, wait for Mobile CI, preview build, and focused Playwright review, then report the PR and screenshots for review.
