---
name: manual-verification-intake
description: "Capture and structure issue/improvement reports after manual app verification. Use when the user reports bugs, UX problems, or enhancement ideas from hands-on testing and wants a strict intake loop: collect one item at a time, clarify ambiguities, log each item with your understanding and post-change verification plan, repeat until the user says all done, then produce a prioritized implementation task list that emphasizes playwright-cli verification and targeted tests."
---

# Manual Verification Intake

## Overview

Run a repeatable intake loop for manual QA findings and convert them into actionable engineering work.
Keep discussion structured, reduce ambiguity early, and output a ready-to-execute task list.

## Intake Loop

Use this sequence for every reported item:

1. Ask for one issue or improvement description.
2. Parse it into a draft entry:
- `id` (MV-001, MV-002, ...)
- `type` (`issue` or `improvement`)
- `title`
- `raw_report` (user wording)
- `assistant_understanding`
3. Clarify only missing essentials (max 3 short questions):
- where it happens (page/route/feature)
- expected vs actual behavior
- reproducible steps / conditions
4. Confirm your understanding in 2-5 lines and ask for confirmation.
5. Write/update the issue log entry with verification-after-fix plan.
6. Ask: `Next issue/improvement? Say "all done" when finished.`

Repeat until user says `all done`.

## Issue Log Content

For each item, include:

- `id`, `type`, `priority` (`high`/`medium`/`low`)
- `area` (page/route/component)
- `assistant_understanding` (clear and testable)
- `proposed_change_direction` (brief)
- `post_change_verification`:
  - `manual_playwright_checks` (specific scenario steps)
  - `automated_tests` (unit/integration/e2e, or `not needed` with reason)
  - `acceptance_criteria` (pass/fail statements)

Use [issue-log-template.md](references/issue-log-template.md) format.

## Finish Condition (`all done`)

When user says `all done`:

1. Stop intake questions.
2. Output consolidated issue log.
3. Create prioritized task list for implementation:
- one task per issue (`MV-001`, `MV-002`, ...)
- scope, likely files/areas, risk
- execution order
- verification plan focused on `playwright-cli`
- add/update unit tests where logic changed
4. Ask whether to start with task 1 immediately.

## Verification Policy

Default verification stack:

- Primary: `playwright-cli` manual flow checks for user-visible behavior.
- Secondary: unit/integration tests for changed logic paths.
- Keep checks concrete and reproducible; avoid vague "verify works" language.

If a test is not added, explicitly state why.

## Output Style

- Ask one focused question at a time.
- Keep clarifications short and technical.
- Do not begin implementation during intake unless user explicitly asks.
- Keep IDs stable once assigned.

## Resources

- `references/issue-log-template.md`: canonical issue entry and final task-list formats.
