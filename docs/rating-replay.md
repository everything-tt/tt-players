# Incremental rating replay

Calculated Glicko-2 ratings are forward processed, but historical imports, score corrections, fixture-date changes and player identity decisions can change already-processed match history. The replay system makes those corrections automatic and bounded.

## Dirty tracking

`rating_processing_state.dirty_from_date` stores the earliest processed date affected by a later data change.

Database triggers mark every existing rating model dirty when:

- a rating-eligible singles rubber is inserted, deleted, corrected, moved or made ineligible;
- the date or deletion state of a fixture changes for a singles rubber that relies on the fixture date; or
- an external player's canonical identity link changes.

Changes after the current processing frontier do not mark the model dirty. Repeated changes retain the earliest affected date.

## Complete checkpoints

At the end of each calendar month represented in match data, the processing-state trigger captures a complete checkpoint containing every current player rating. The checkpoint also stores the current ISO-week history values needed to continue weekly accumulation without double counting.

A migration-time baseline checkpoint is created from the current rating state. Explicit full rebuilds replace all checkpoints as they replay history.

## Replay

Before normal scheduled or manual rating calculation:

1. acquire the existing advisory rating lock;
2. read `dirty_from_date`;
3. restore the latest complete checkpoint strictly before that date;
4. remove weekly history and checkpoints after the restored point;
5. restore the checkpoint's player ratings and partial-week history under transaction-local trigger suppression;
6. clear the dirty marker and resume the existing day-by-day calculator.

If no earlier checkpoint exists, the model safely rebuilds from the beginning. After one full history rebuild, monthly checkpoints make later corrections incremental.

## Commands

The normal worker task and manual calculation command are replay-aware:

```bash
pnpm --filter @tt-players/worker ratings:calculate
```

A deliberate full rebuild remains available:

```bash
pnpm --filter @tt-players/worker ratings:calculate -- --rebuild
```

Rebuilding weekly history clears ratings, weekly history, dirty state and checkpoints before replaying the requested range.
