# Player Match Row Actions Design

## Goal

Make recent-match rows easier to scan and remove the action drawer from the normal match-list workflow, while preserving the existing player profile structure and infinite loading.

## Row hierarchy

- The opponent name and result remain the primary content.
- The date moves from a large leading capsule into the metadata line.
- Metadata uses `DD Mon YYYY · competition`, with the year always visible at a smaller size.
- The complete row remains an independent chronological match; results are not grouped.

## Interaction

### Main row action

When `opponent_id` is available, tapping the main row opens the opponent profile. If no opponent profile is available, the row is not presented as clickable.

### Other player profile

The trailing area contains one direct action:

- View fixture, or View event for tournament matches.

### My player profile

The trailing area contains two direct actions:

- Quick Journal.
- View fixture or event.

The row must not use an overflow button or bottom-sheet action menu.

## Visual treatment

- Remove the bordered/tinted date capsule.
- Keep the result pill restrained and semantic.
- Use compact rounded-square icon buttons with full touch targets.
- Give Quick Journal a subtle accent treatment and keep the fixture/event action neutral.
- Long competition labels truncate rather than forcing a tall row.

## Accessibility

- Main-row accessible content states that it opens the opponent profile.
- Direct buttons include descriptive labels containing the opponent name.
- The smaller year remains visible text, not decorative content.
- Keyboard focus uses the existing design-system focus ring.

## Scope

Apply the shared row consistently to both the profile Recent Matches section and the full match-history page. Do not change the player hero, other profile sections, paging model, or journal form.
