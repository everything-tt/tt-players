# Tournament Detail Responsive Hero Design

**Date:** 2026-08-02  
**Status:** Proposed for implementation with the native search browse-pages PR  
**Scope:** `EventDetailPage`, shared `EntityHero` resilience, and responsive regression coverage

## 1. Problem

The tournament detail hero can collapse its event identity to an unusably narrow column on a phone when several actions are present.

The current hero places the copy and actions in one non-wrapping flex row. The actions are fixed-width content while the copy is the only flexible child. With `Save`, `Enter online`, and `Original listing` present, the copy shrinks almost to zero. Because the title currently permits wrapping anywhere, a tournament name can render one letter per line.

This is a structural layout failure, not a data or typography issue.

## 2. Chosen treatment

The tournament detail page keeps a compact event hero, but separates identity from actions:

1. category/competition metadata;
2. full-width tournament name;
3. date and source metadata;
4. responsive action row;
5. recorded-result metrics when available.

The title must always receive a useful content width before actions are laid out.

On phone widths, actions sit on their own row below the title and subtitle. They may wrap across multiple lines, but must never reduce the title to a narrow column.

On wider layouts, the component may retain an inline arrangement only when sufficient width is available.

## 3. Shared `EntityHero` changes

Make the design-system component intrinsically resilient rather than relying on a tournament-only width override.

Add an explicit action-placement option to `EntityHero`:

- `auto`: inline on sufficiently wide layouts and stacked below the identity on narrow layouts;
- `below`: actions always occupy their own row below the identity;
- `inline`: reserved for compact action sets whose inline layout is intentional.

Default to `auto` so existing consumers gain safe responsive behaviour.

`EventDetailPage` uses `below` because it may expose three substantial actions and the event name is the primary content.

The implementation must also:

- allow the hero main region to wrap safely;
- give the copy a real flexible basis rather than allowing it to shrink toward zero;
- constrain the actions container to the hero width;
- allow the action contents to wrap;
- preserve leading artwork/avatar layout for other hero consumers;
- avoid horizontal overflow at 320px;
- keep metrics below the identity/actions without overlap.

## 4. Text wrapping

Change hero-title wrapping from arbitrary-character wrapping to normal word-oriented wrapping:

- `word-break: normal`;
- `overflow-wrap: break-word`;
- no one-character-per-line rendering for ordinary tournament names.

Exceptionally long unbroken tokens may break to prevent overflow, but normal names should wrap at spaces.

The eyebrow/category text also receives the full copy width and wraps normally. Long category strings must not create a narrow vertical stack.

## 5. Tournament action hierarchy

Keep the existing actions and meaning:

- `Save` / `Saved` toggle;
- `Enter online` as the primary action when an entry URL exists;
- `Original listing` as a secondary external action when a public URL exists.

On phones:

- the action group appears below the event subtitle;
- controls retain at least a 44px touch target;
- controls wrap naturally according to available width;
- the primary action remains visually strongest;
- no action overlaps, clips, or pushes the title aside.

Do not move these actions into the fixed header. The detail header already owns navigation, feedback, and sharing; event-specific actions belong with the event identity.

## 6. Content and page behaviour

This fix must not alter:

- tournament data semantics;
- conditional results rendering;
- event-information sections;
- favourite persistence;
- external URLs;
- share behaviour;
- bottom-tab navigation.

The page should use its existing content gutter and bottom-navigation clearance. The hero must fit within the available content width without introducing nested horizontal scrolling.

## 7. Testing

### Component tests

Add `EntityHero` coverage for:

- `auto`, `below`, and `inline` action placement classes;
- title, subtitle, leading content, actions, and highlights rendering together;
- accessible action content remaining reachable.

### Responsive visual tests

Capture the tournament detail page with a long name and all three actions at:

- 320px;
- 360px;
- 412px;
- a wider tablet/desktop viewport.

Assert visually and, where practical, through layout measurements that:

- the title has a usable width;
- no title renders one character per line;
- actions are below the identity on phone widths;
- buttons remain within the hero bounds;
- no horizontal page overflow is introduced;
- recorded metrics remain readable.

### Regression checks

Review other `EntityHero` consumers, especially player, team, league, fixture, and design-system catalogue screens, to ensure the safer default does not produce unintended action placement or spacing changes.

## 8. Delivery

Implement this as part of the same PR as the Players and Tournaments native browse-page migration. The work is closely related to tournament mobile usability and shares the same screenshot-validation workflow.

The implementation plan must treat the responsive hero correction as a separate task with its own tests, so it can be reviewed independently within the PR.
