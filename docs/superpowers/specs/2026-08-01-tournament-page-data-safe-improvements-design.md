# Tournament Page Data-Safe Improvements

## Goal

Make the tournament detail page more informative and easier to navigate while only presenting facts supported by the imported event and match data.

## Current data boundary

The page currently receives tournament metadata plus match records containing player identities, winner side, round name/order, and an optional played time. It derives each player's played, wins, losses, and win percentage from those records.

The page must not infer or display final standings, champion, runner-up, seed, rating, rating movement, game score statistics, group placement, or bracket structure unless the API later exposes those fields explicitly.

## Design

### Tournament summary

Keep the existing name, category, date, match count, source, save, share, and source-link controls. Add compact derived counts for:

- unique players
- distinct named rounds, labelled "recorded rounds"
- undefeated players in the available result set

The wording must make clear that these counts describe the imported records, not an official tournament classification.

### Leading records

Rename "Top Players" to "Most Wins" and remove numbered rank badges. Show up to three players using wins, losses, win percentage, and matches played. Sorting remains deterministic by wins, win percentage, matches played, then name, but the UI must not imply official placement.

### Player exploration

Retain player search and favourite controls. Make player rows clearly actionable for filtering the tournament's match list. Selected-player state should visibly explain that results are filtered and provide a clear reset action.

Add lightweight record filters only where they can be derived safely:

- all players
- undefeated players

Do not add rating, seed, standing, or placement filters.

### Round exploration

Add a compact round selector generated directly from source-provided round names and ordered by `round_order`. It includes an "All" option. Selecting a round filters the results without altering or normalising the source round labels.

Player and round filters compose: selecting both shows only matches for that player in that recorded round.

### Match results

Continue grouping unfiltered/all-round results by round. When one round is selected, show that round's matches without a duplicate nested heading where practical. Preserve winner highlighting, played time, and player-profile navigation.

Where both players resolve to internal player IDs, expose an H2H navigation action using the existing application route/pattern. Do not show the action for unresolved external players.

## Empty and incomplete data

- Hide derived summary values that cannot be calculated meaningfully.
- "Undefeated" means no losses within the imported matches only.
- Tournaments with no results retain the existing no-results state.
- Missing round names remain grouped under the existing neutral "General" label; they do not count as named recorded rounds.

## Testing

Add or update tests to verify:

- the section is labelled "Most Wins" and has no implied podium numbering
- player, match, recorded-round, and undefeated counts are derived correctly
- round filtering works and composes with player filtering
- unresolved players do not expose profile/H2H actions
- no official standings, champion, runner-up, rating, or rating-change labels are rendered
- empty-result behaviour remains correct

## Scope exclusions

No API or schema changes are required for this iteration. No official standings reconstruction, rating ingestion, game-score analytics, bracket rendering, or LLM-generated tournament narrative is included.
