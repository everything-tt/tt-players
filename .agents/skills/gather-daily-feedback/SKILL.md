---
name: gather-daily-feedback
description: Triage every unlinked feedback row in the production TT Players database, inspect and attach feedback screenshots, compare feedback with the codebase and active GitHub issues, create or update appropriate issues, persist issue links back to feedback rows, and report all actions. Use when the user asks to process pending feedback, create issues from feedback, clear the feedback backlog, run feedback triage, or generate a feedback-to-GitHub report.
---

# Triage Feedback Backlog

Process production feedback into actionable GitHub issues. Treat database reads,
code analysis, GitHub writes, and database writes as distinct stages.

## 1. Collect

Run from the repository root:

```bash
bash .agents/skills/gather-daily-feedback/scripts/gather-daily-feedback.sh --json
```

By default, collect every row where `github_issue_url IS NULL`, regardless of
when it was received. Use `--date YYYY-MM-DD` only when the user explicitly
requests a date-specific subset.

If no unlinked rows exist, report that no feedback needs triage and stop.

## 2. Inspect Active Issues

Resolve the repository from `git remote get-url origin`. Prefer the GitHub app
for issue reads and writes. Use `gh` only when the app is unavailable or when a
search capability is missing.

Fetch all active issues, including number, title, body, labels, URL, and recent
comments when a possible match is found. Do not rely only on title matching.

## 3. Analyze Against Code

For each feedback row:

1. Extract the user-visible behavior, affected screen or workflow, and expected
   outcome.
2. Search the repository with `rg` for relevant labels, route names, components,
   hooks, API routes, and tests.
3. Read only the likely implementation and test files.
4. When `attachment` metadata is present, download and inspect it:

```bash
bash .agents/skills/gather-daily-feedback/scripts/download-feedback-attachment.sh \
  --feedback-id UUID \
  --output /tmp/feedback-UUID.png
```

Use the actual MIME type or filename extension for the output path and inspect
the image. Keep the temporary copy until it has been attached to GitHub and the
rendered image has been verified.
5. Record a minimal analysis:
   - likely affected area and file paths
   - current behavior inferred from code
   - probable implementation direction
   - verification needed
6. Do not claim a root cause unless the code establishes it.

Keep this analysis short. The goal is issue quality, not a full implementation
plan.

## 4. Decide Create vs Update

Treat a GitHub issue as a unit of work, not as a one-to-one representation of a
feedback row. Feedback rows are evidence for that work item.

Start by clustering feedback into likely work items:

- Group small, trivial, or clearly bounded polish feedback into one batch issue
  even when the items touch different screens, as long as a coding agent can
  plausibly implement and verify them in one pass without a product decision.
- Prefer a themed batch when several small items share an area, but do not force
  one issue per area for low-risk cleanup.
- Keep feedback separate when it implies a larger feature, ambiguous product
  direction, data-model/API work, higher release risk, or isolated investigation.
- Create a standalone issue for a large change, ambiguous product direction, or
  a bug that needs isolated investigation.

Then compare each proposed work item with active issues. Update an active issue
when it already covers the same user-visible problem, same feature outcome, or
same implementation-sized unit of work. Similar screens, shared components, or
broad themes alone are not sufficient.

- **Update existing:** add a comment containing the feedback, code analysis,
  verification notes, screenshot when present, and
  `<!-- feedback-id: UUID -->`.
- **Create new:** use a concise outcome-focused title and include the template
  from [references/issue-template.md](references/issue-template.md).
- **Multiple feedback rows:** link several rows to one issue when one coherent
  implementation pass can reasonably resolve all of them, including an
  intentionally mixed "small polish batch". The issue body should list each
  feedback row separately with its own acceptance note so none of the
  user-visible details are lost.
- **Retry safety:** search the issue body/comments for the feedback ID marker
  before writing. If found, reuse that issue without adding another comment.

Use labels only when matching labels already exist. Do not invent repository
labels as part of this workflow.

## 5. Attach Screenshots

When feedback has an image attachment, publishing that image on the target
issue is mandatory:

1. Prefer uploading the local image through an authenticated GitHub issue body
   or comment editor so GitHub creates a native attachment URL.
2. For a new issue, include the rendered image under `## Feedback screenshot`
   in the issue body. For an existing issue, include it in the feedback comment.
3. If native upload is unavailable, use a stable repository-backed image URL
   that GitHub can render. Do not use `/tmp`, local paths, data URLs, expiring
   URLs, or links requiring database credentials.
4. Add descriptive alt text that identifies the affected screen.
5. After writing, fetch or open the issue and verify all of the following:
   - the screenshot section or comment exists
   - Markdown contains an image, not only a filename or hyperlink
   - the image URL returns success
   - GitHub renders an image with the expected alt text
6. Delete the temporary attachment only after verification succeeds.

Treat screenshot publication as part of the GitHub write. If upload or rendered
verification fails, do not link the feedback row in the database. Report the
item as failed and retain enough information to retry without creating a
duplicate issue or comment.

## 6. Write Issues

Before the first GitHub mutation, record the proposed mapping in the working
notes or progress update:

```text
feedback ID -> create issue "<title>"
feedback ID -> update issue #123
```

This workflow is unattended by default. Do not ask for human confirmation before
GitHub or database writes unless the mapping is ambiguous, the write would be
destructive, or the user explicitly asks to review before writing. Create issues
or add comments one at a time.

If a GitHub write fails, do not update that feedback row.

## 7. Persist Links

After each successful GitHub write, successful screenshot verification when an
attachment exists, or confirmed retry match with its screenshot already
rendering, run:

```bash
bash .agents/skills/gather-daily-feedback/scripts/link-feedback-issue.sh \
  --feedback-id UUID \
  --issue-url https://github.com/OWNER/REPO/issues/123
```

The script only links an unlinked row. Never overwrite a different existing
issue URL automatically. If linking fails after a GitHub write, report the issue
as created/updated but the feedback row as not linked.

Migration `025_add_feedback_github_issue_link.ts` must be deployed before this
stage can succeed.

## 8. Report

Return a concise Markdown report with:

- scope and total feedback examined
- created issues: feedback ID, title, URL
- updated issues: feedback ID, issue number/title, URL
- reused links found through retry markers
- skipped feedback and reason
- screenshot status for every feedback item with an attachment
- database link failures
- a short code-analysis note for each processed item

Never expose database credentials, feedback email addresses in public issues,
or other private production configuration. Include a submitter's name only when
it is relevant and clearly safe; default to “User feedback.”

## Defaults

- Timezone: `Europe/London`
- Aiven project: `ttevents`
- Aiven service: `tt-players-db`
- Database: `tt_players`
- Repository: resolve from the current checkout
- Queue: every feedback row without a GitHub issue link

Override infrastructure through `REPORT_TIMEZONE`, `AIVEN_PROJECT`,
`AIVEN_SERVICE`, or `DATABASE_NAME` only when deployment configuration changes.
Use `DATABASE_URL` only for isolated local testing; do not expose its value.
