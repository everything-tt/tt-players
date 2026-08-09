# VETTS tournament results ingestion

Issue: #122

## Sources

VETTS publishes static year calendars on its own website and hosts detailed draws and results on its Tournament Software tenant.

Representative URLs:

- Current calendar: `https://www.vetts.org.uk/ourtournaments`
- Year calendar: `https://www.vetts.org.uk/tournaments.aspx?year=2026`
- Tournament overview: `https://vetts.tournamentsoftware.com/tournament/4af81622-d21a-47ed-a046-86c492b4cfe9`
- Match day: `https://vetts.tournamentsoftware.com/tournament/4af81622-d21a-47ed-a046-86c492b4cfe9/matches/20260517`

The year calendars are the discovery source because their tournament links are available in fetched HTML. The Tournament Software `find` page is client-rendered and must not be treated as a successful empty directory.

The adapter key is `tournamentsoftware-vetts` and its current parser version is `1.1.0`. Its declared resource types are `directory`, `event`, and `event-results`. Recurring discovery, one-off backfills, tournament overviews, and result pages all execute through the adapter's `extract`/`transform` contract.

## Source hierarchy

- `platforms`: the provider family, **Tournament Software** (`https://www.tournamentsoftware.com`).
- `source_instances`: the concrete VETTS tenant (`https://vetts.tournamentsoftware.com`) with the official calendar base URL in instance configuration.
- `source_resources`: one independently refreshed resource per year calendar, tournament overview, and tournament result set.

Each calendar year records success or failure independently. Overview and result resources also transition health independently, so a bad result page does not make a valid overview appear unhealthy. Empty or unparsable calendars fail closed so the Data Coverage dashboard cannot report a healthy source after discovery silently stops working.

## Data flow

1. `scrapeVettsTournamentsTask` runs the shared registered discovery pipeline over a bounded set of official VETTS year calendars.
2. Successful discoveries queue idempotent tournament jobs with the shared retry policy, stable job keys, and the `vetts-tournamentsoftware` queue so upstream tournament requests execute serially.
3. `scrapeVettsTournamentTask` fetches the overview, resolves it only against authoritative TTE calendar competitions, or creates a separate reviewable tournament, then fetches each tournament day separately.
4. Every HTML response is retained in `staging.raw_scrape_logs` before transformation. Malformed pages are marked failed and remain replayable. Normalized event/result observations are stored in `staging.source_events` and `staging.source_event_result_rows`.
5. Stable tournament UUIDs, draw IDs, match IDs, and VETTS member IDs are preserved. Tournament Software's `player=` value is an entry-page identifier rather than a durable person identifier, so match/H2H `MemberID` values are preferred.
6. Player identities are tenant-scoped because `external_players` uniqueness is platform-wide: `tournamentsoftware:vetts:member:<member-id>`. When a member ID is unavailable, the fallback is `tournamentsoftware:vetts:entry:<tournament-id>:<entry-id>`.
7. Parsed players, fixtures, and rubbers are loaded through the existing transactional UPSERT loader.
8. Singles observations are compared with existing same-day rubbers from Sport:80, TT Leagues, and other providers, including observations already attached to the same canonical competition. An exact participant/result match links the VETTS source row to the existing canonical rubber and soft-deletes only the duplicate VETTS rubber.
9. Ambiguous or conflicting candidates retain the imported VETTS rubber as effective, link provenance to it, and store `duplicateReview` evidence rather than silently overwriting or hiding data.

## Parsing and lifecycle rules

- A normal result must contain valid table-tennis game scores: the winner reaches at least 11 and wins by two.
- Walkovers and retirements are retained with explicit `outcome_type` values.
- Byes and cancelled rows are recorded as parser diagnostics and are not loaded as played matches.
- Doubles are parsed and loaded with two players per side. They retain a canonical provenance link but are excluded from name-only cross-provider duplicate linking.
- Rows without two singles players or four doubles players, a winner, or valid scores are rejected without inventing data.
- Separate VETTS competitions derive `upcoming`, `in_progress`, or `completed` from their dates. Partial live results do not prematurely mark an in-progress event completed.

## Running a bounded backfill

From the repository root:

```bash
pnpm --filter @tt-players/worker vetts:scrape -- 4af81622-d21a-47ed-a046-86c492b4cfe9
```

Multiple UUIDs may be supplied. UUIDs are validated and de-duplicated. With no UUIDs, the command uses the same registered discovery pipeline as the worker, scans the current and previous calendar years by default, and processes at most `VETTS_DISCOVERY_LIMIT` unique tournaments. The default limit is 30 and the hard cap is 100.

`VETTS_DISCOVERY_YEARS` controls how many descending calendar years are scanned. The default is 2 and the hard cap is 10. This supports bounded historical backfills without relying on the client-rendered Tournament Software directory.

Each tournament is processed one match-day page at a time and a maximum of seven dates is enumerated from its overview. This bounds response memory and database transaction size.

### Manual GitHub Actions backfill

After the VETTS scraper has been merged and deployed, open **Actions → Backfill VETTS tournament results → Run workflow**.

The workflow supports two bounded modes:

- `discovery`: scan official year calendars and process up to `discovery_limit` tournaments.
- `tournament_ids`: process one or more comma- or space-separated Tournament Software UUIDs.

The action requires `confirm=BACKFILL_VETTS`, accepts at most 10 calendar years and 100 tournaments per run, runs the deployed worker under the production `ttp` system user, and prevents overlapping backfills. Its summary reports loaded and rejected match rows plus duplicate links/conflicts. The complete command log is retained as a GitHub Actions artifact for seven days.

## Recurring refresh and recovery

The worker runs `scrapeVettsTournamentsTask` each Monday at 04:15. The default two-year window refreshes current events and recently completed tournaments. Calendar, event, and result resources appear in the existing Data Coverage API with parser version, fetch/success timestamps, failure count, and bounded error text.

Failed calendar years are recorded independently; successful years may still queue work, after which the discovery job fails so Graphile Worker retries the partial failure. Tournament jobs use the shared three-attempt retry, stable dedupe key, and serialized upstream queue.

To recover a specific tournament after an upstream or parser failure, run the one-off command with its UUID or enqueue `scrapeVettsTournamentTask` again. Source observations and canonical loader identities are UPSERTed, so reruns do not create duplicate source rows. Duplicate reconciliation is also rerun-safe: exact duplicates remain suppressed, while conflicts restore and retain the imported VETTS rubber.

`VETTS_DISCOVERY_LIMIT` and `VETTS_DISCOVERY_YEARS` can temporarily reduce the batch during recovery. Do not increase the seven-day per-tournament bound without reviewing memory and queue impact.

## Test coverage

- representative directory, overview, singles, doubles, walkover, invalid-score, and bye fixtures;
- adapter manifest and directory transform tests;
- stable tenant-scoped member identity and tournament-scoped fallback tests;
- lifecycle and bounded-date tests;
- worker discovery retry, serialization, dedupe, empty-source, limit, and partial-failure tests;
- database integration coverage for production migrations, raw provenance, source registry health, repeated UPSERT ingestion, canonical duplicate linking, and one effective rubber after reruns;
- API H2H integration coverage proving the reconciled encounter appears once while the soft-deleted imported duplicate stays hidden.

A production tournament has not been backfilled by this PR. Production verification should be performed only after merge and deployment by running a bounded workflow invocation and checking player profile/H2H responses.
