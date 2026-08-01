# Tournament Page Data-Safe Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tournament page more informative using only facts directly present in, or safely derived from, the imported match records.

**Architecture:** Keep all derivation local to `EventDetailPage`: build player records from match winners, derive source-provided round names, and apply player and round filters together. Preserve the existing event-detail API and avoid introducing inferred standings, champions, ratings, seeds, brackets, or game-level statistics.

**Tech Stack:** React, TypeScript, existing TT Players mobile UI components.

## Global Constraints

- Do not describe win-sorted players as final standings or tournament placings.
- Do not expose or infer England ratings.
- Use only event metadata and imported match records already returned by `useEventDetailQuery`.
- Treat round names as source-provided labels and call their count “recorded rounds”.
- Treat undefeated as “no losses in the imported matches for this tournament”.

---

### Task 1: Data-safe tournament summary and leaders

**Files:**
- Modify: `apps/mobile/src/EventDetailPage.tsx`

**Interfaces:**
- Consumes: `detailQuery.data.event`, `detailQuery.data.results`.
- Produces: derived player count, recorded-round count, undefeated count, and `mostWinsPlayers`.

- [ ] Rename the win-sorted section from “Top Players” to “Most Wins”.
- [ ] Remove numeric podium/rank badges from its cards.
- [ ] Add player, recorded-round, and undefeated counts to the tournament summary.
- [ ] Keep record copy explicit: wins, losses, win rate, and imported match count.

### Task 2: Combined round and player result filtering

**Files:**
- Modify: `apps/mobile/src/EventDetailPage.tsx`

**Interfaces:**
- Consumes: source-provided `round_name`, selected player key.
- Produces: `selectedRound`, round filter controls, and filtered/grouped match results.

- [ ] Derive ordered distinct round labels from imported results, using `General` only when the source provides no name.
- [ ] Add an All-rounds option plus one control for each recorded round.
- [ ] Apply the selected round and selected player filters together.
- [ ] Show a clear active-filter summary and allow either filter to be cleared independently.
- [ ] Preserve existing match rendering and player selection behavior.

### Task 3: Verification and PR

**Files:**
- Verify: `apps/mobile/src/EventDetailPage.tsx`

- [ ] Review the diff for forbidden inferences such as standings, champion, runner-up, rating, seed, or bracket claims.
- [ ] Confirm TypeScript/JSX syntax through repository CI.
- [ ] Open a PR to `main` with the data limitations and behavior clearly documented.
