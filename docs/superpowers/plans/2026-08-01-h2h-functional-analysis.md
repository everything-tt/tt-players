# H2H Functional Analysis Plan

## Goal

Build on the H2H design-system refresh with richer matchup analysis that remains useful even when two players have few or no direct encounters.

## Product scope

### 1. Common-opponent analysis

For every opponent faced by both selected players, calculate:

- matches played by each selected player against the common opponent;
- wins, losses, and win rate;
- latest encounter date;
- rating or ranking context when available;
- an advantage indicator showing which selected player performed better against that opponent.

Present an aggregate summary first, followed by a compact expandable list of common opponents.

### 2. Direct encounter summary

Keep direct H2H results as the strongest evidence and clearly separate them from indirect common-opponent evidence.

Include:

- total encounters and score;
- recent encounter trend;
- competition/league breakdown;
- latest encounter;
- match history.

### 3. Recent-form comparison

Compare each player over a consistent recent window:

- latest 5 and latest 10 singles;
- wins and losses;
- strength of opposition when available;
- rating movement;
- activity/recency.

### 4. Rating and prediction explanation

Extend the prediction panel with a concise “Why this prediction?” explanation based on:

- current rating difference;
- direct H2H evidence;
- common-opponent performance;
- recent form;
- sample-size confidence.

The explanation must distinguish facts from model-derived inference and display low confidence when evidence is sparse.

### 5. Interaction improvements

- Make each player picker card fully tappable for changing the selected player.
- Move profile access to a small top-right icon/action so it never overlaps player names or statistics.
- Preserve favourite matchup, share, clear, and swap actions.
- Add a single-tap swap action for Player A and Player B.
- Keep all actions at least 44px and accessible.

## Backend/API approach

Prefer one H2H analysis endpoint returning the assembled comparison rather than multiple sequential client queries.

Suggested response groups:

- `direct`
- `common_opponents`
- `recent_form`
- `rating_comparison`
- `prediction`
- `confidence`

The common-opponent query should aggregate matches by opponent for both player IDs and should be index-friendly on player/opponent IDs and match date. Add limits and pagination for the detailed common-opponent list.

## Delivery sequence

1. Add API contract and failing backend tests.
2. Implement common-opponent aggregation and recent-form comparison.
3. Extend prediction explanation and confidence calculation.
4. Add typed mobile query models.
5. Build design-system-compatible H2H sections.
6. Add loading, empty, error, and sparse-data states.
7. Add API, component, and interaction tests.
8. Run full mobile/backend CI and perform 360px/390px visual review.

## Stacked PR relationship

This branch is based on `agent/sticky-search-and-h2h-refresh` (PR #51). PR #51 owns the shared visual refresh and sticky search pattern. This PR owns the H2H product functionality and analysis.