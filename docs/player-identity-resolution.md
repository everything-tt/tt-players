# Player identity resolution

TT Players preserves one `external_players` row for every source profile. Canonical identity links are an application-level grouping and never rewrite source IDs stored on rubbers.

## Decision workflow

Cross-platform exact-name matches are now candidate evidence, not proof of identity.

1. `reconcilePlayersByName` creates `suggested` rows in `player_identity_decisions`.
2. Suggestions contain confidence, the matching rule, platform IDs and source external IDs.
3. A reviewer or trusted workflow confirms or rejects the suggestion.
4. Only `confirmed` decisions update `external_players.canonical_player_id`.
5. Rejecting or unmerging a link prevents the same exact-name rule from silently recreating it.

## Decision states

- `suggested`: review is required and canonical IDs remain unchanged.
- `confirmed`: the source row is grouped under the selected canonical player.
- `rejected`: the proposed pair is known not to represent the same person.

## Safety properties

- Rubber player columns always retain their original source-player IDs.
- Confirmation requires two distinct active player rows.
- Confidence is constrained to the range 0–1.
- Every decision records structured evidence, creator and decision timestamp.
- Unmerge restores the alias to a self-canonical identity and rejects its confirmed decision.

Future identity evidence can include governing-body athlete IDs, county, club history, age category and overlapping competition records without changing the decision model.
