# Issue Log Template

Use this format during intake.

## Entry Template

```markdown
### MV-00X - <Short title>
- Type: issue | improvement
- Priority: high | medium | low
- Area: <page/route/component>
- Raw report: <user wording>
- Assistant understanding: <clear, testable restatement>
- Proposed change direction: <brief implementation intent>

- Post-change verification:
  - Manual (playwright-cli):
    1. <step>
    2. <step>
    3. <expected result>
  - Automated tests:
    - <unit/integration/e2e test additions or "not needed: <reason>">
  - Acceptance criteria:
    - [ ] <observable pass condition>
    - [ ] <observable pass condition>
```

## Final Task List Template

Use when user says `all done`.

```markdown
## Implementation Task List

1. MV-001 - <title>
- Scope: <where code likely changes>
- Plan: <concise steps>
- Verification:
  - playwright-cli: <scenario checks>
  - tests: <test file(s) to add/update>

2. MV-002 - <title>
- Scope: <...>
- Plan: <...>
- Verification:
  - playwright-cli: <...>
  - tests: <...>
```
