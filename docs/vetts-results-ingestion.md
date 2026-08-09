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

Each calendar year records success or failure independently. Overview and result resources also transition health independently, so a bad result page does not make a valid overview appear unhealthy. Scheduled discovery fails closed on an unexpectedly empty current/recent calendar so the Data Coverage dashboard cannot report a healthy source after discovery silently stops working.

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

## Running a backfill

From the repository root, explicit tournament UUIDs can still be processed directly:

```bash
pnpm --filter @tt-players/worker vetts:scrape -- 4af81622-d21a-47ed-a046-86c492b4cfe9
```

Multiple UUIDs may be supplied. UUIDs are validated and de-duplicated.

With no UUIDs, the command uses the registered discovery pipeline. Its normal CLI defaults remain bounded (`VETTS_DISCOVERY_YEARS=2`, `VETTS_DISCOVERY_LIMIT=30`) so ad-hoc invocations do not unexpectedly become a full production backfill.

For a full historical backfill use:

```bash
VETTS_DISCOVERY_YEARS=all VETTS_DISCOVERY_LIMIT=all \
  pnpm --filter @tt-players/worker vetts:scrape
```

`VETTS_DISCOVERY_YEARS=all` scans from the current calendar year back through 1984, the first VETTS tournament year. Historical years with no published Tournament Software links are accepted as empty during this explicit full-history mode; extraction or transformation failures are still recorded. A positive integer may be supplied instead to scan only that many descending years.

`VETTS_DISCOVERY_LIMIT=all` processes every unique tournament discovered in the selected years. A positive integer may be supplied to deliberately cap a manual run.

Each tournament is processed one match-day page at a time and a maximum of seven dates is enumerated from its overview. This bounds response memory and database transaction size even when the overall historical backfill is unbounded by tournament count.

### Manual GitHub Actions backfill

After deployment, open **Actions → Backfill VETTS tournament results → Run workflow**.

The workflow supports two modes:

- `discovery`: discover tournaments from official VETTS year calendars. This is the default mode, with `discovery_years=all` and `discovery_limit=all`, so pressing Run after entering the confirmation token performs a complete available-history backfill.
- `tournament_ids`: process one or more comma- or space-separated Tournament Software UUIDs.

For a smaller discovery run, replace either `all` value with a positive integer, for example `discovery_years=2` and `discovery_limit=30`.

The action requires `confirm=BACKFILL_VETTS`, runs the deployed worker under the production `ttp` system user, serializes tournament processing through the existing ingestion path, prevents overlapping backfills, and allows up to six hours for a full-history run. Its summary reports loaded and rejected match rows plus duplicate links/conflicts. The complete command log is retained as a GitHub Actions artifact for seven days.

## Recurring refresh and recovery

The worker runs `scrapeVettsTournamentsTask` each Monday at 04:15. The scheduled path is intentionally unchanged: the default two-year window refreshes current events and recently completed tournaments, and the task still caps queued tournaments at 100. Calendar, event, and result resources appear in the existing Data Coverage API with parser version, fetch/success timestamps, failure count, and bounded error text.

Failed calendar years are recorded independently; successful years may still queue work, after which the discovery job fails so Graphile Worker retries the partial failure. Tournament jobs use the shared three-attempt retry, stable dedupe key, and serialized upstream queue.

To recover a specific tournament after an upstream or parser failure, run the one-off command with its UUID or enqueue `scrapeVettsTournamentTask` again. Source observations and canonical loader identities are UPSERTed, so reruns do not create duplicate source rows. Duplicate reconciliation is also rerun-safe: exact duplicates remain suppressed, while conflicts restore and retain the imported VETTS rubber.

`VETTS_DISCOVERY_LIMIT` and `VETTS_DISCOVERY_YEARS` can reduce a manual batch during recovery. Do not increase the seven-day per-tournament bound without reviewing memory and queue impact.

## Test coverage

- representative directory, overview, singles, doubles, walkover, invalid-score, and bye fixtures;
- adapter manifest and directory transform tests;
- stable tenant-scoped member identity and tournament-scoped fallback tests;
- current/recent bounded discovery plus full-history year-range tests;
- lifecycle and bounded-date tests;
- worker discovery retry, serialization, dedupe, empty-source, limit, and partial-failure tests;
- database integration coverage for production migrations, raw provenance, source registry health, repeated UPSERT ingestion, canonical duplicate linking, and one effective rubber after reruns;
- API H2H integration coverage proving the reconciled encounter appears once while the soft-deleted imported duplicate stays hidden.
