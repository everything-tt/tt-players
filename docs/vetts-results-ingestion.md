# VETTS tournament results ingestion

Issue: #122

## Sources

VETTS publishes its tournament calendar on its own website and hosts detailed draws and results on its Tournament Software tenant.

Representative URLs:

- Calendar: `https://www.vetts.org.uk/ourtournaments`
- Tournament directory: `https://vetts.tournamentsoftware.com/find?StatusFilterID=2`
- Tournament overview: `https://vetts.tournamentsoftware.com/tournament/4af81622-d21a-47ed-a046-86c492b4cfe9`
- Match day: `https://vetts.tournamentsoftware.com/tournament/4af81622-d21a-47ed-a046-86c492b4cfe9/matches/20260517`

The adapter key is `tournamentsoftware-vetts` and its current parser version is `1.0.0`.

## Data flow

1. `scrapeVettsTournamentsTask` reads the completed-tournament directory and queues bounded tournament jobs.
2. `scrapeVettsTournamentTask` fetches the overview, resolves or creates the canonical tournament, then fetches each tournament day separately.
3. Every HTML response is retained in `staging.raw_scrape_logs`; normalized event/result observations are stored in `staging.source_events` and `staging.source_event_result_rows`.
4. Stable Tournament Software UUIDs, draw IDs, player IDs and match-info IDs are used where available. A deterministic hash is used only when the upstream page has no match ID.
5. Parsed players, fixtures and rubbers are loaded through the existing idempotent canonical loader.
6. Singles observations are compared with existing same-day rubbers from Sport:80, TT Leagues and other providers. An exact participant/result match links the VETTS observation to the existing canonical rubber and soft-deletes the duplicate VETTS rubber. Ambiguous or conflicting candidates remain staged in the raw payload under `duplicateReview`.

## Parsing rules

- A normal result must contain valid table-tennis game scores: the winner reaches at least 11 and wins by two.
- Walkovers and retirements are retained with explicit `outcome_type` values.
- Byes and cancelled rows are recorded as parser diagnostics and are not loaded as played matches.
- Doubles are parsed and loaded with two players per side; they are excluded from name-based cross-provider duplicate linking.
- Rows without two singles players or four doubles players, a winner, or valid scores are rejected without inventing data.

## Running a bounded backfill

From the repository root:

```bash
pnpm --filter @tt-players/worker vetts:scrape -- 4af81622-d21a-47ed-a046-86c492b4cfe9
```

Multiple UUIDs may be supplied. With no UUIDs, the command discovers completed tournaments and processes at most `VETTS_DISCOVERY_LIMIT` entries; the default is 30 and the worker caps discovery at 100.

Each tournament is processed one match-day page at a time and a maximum of seven dates is enumerated from its overview. This bounds response memory and database transaction size.

### Manual GitHub Actions backfill

After the VETTS scraper has been deployed, open **Actions → Backfill VETTS tournament results → Run workflow**.

The workflow supports two bounded modes:

- `discovery`: process up to `discovery_limit` completed tournaments from the Tournament Software directory.
- `tournament_ids`: process one or more comma- or space-separated Tournament Software UUIDs.

The action requires `confirm=BACKFILL_VETTS`, accepts at most 100 tournaments per run, runs the deployed worker under the production `ttp` system user, and prevents overlapping backfills. Its summary reports loaded and rejected match rows plus duplicate links/conflicts. The complete command log is retained as a GitHub Actions artifact for seven days.

## Recurring refresh and recovery

The worker runs `scrapeVettsTournamentsTask` each Monday at 04:15. The source registry exposes the directory, event and event-results resources to the existing Data Coverage API, including parser version, last fetch/success timestamps, failure count and error text.

Failed jobs use the standard retry policy. To recover a specific tournament after an upstream or parser failure, run the one-off command with its UUID or enqueue `scrapeVettsTournamentTask` again. UPSERT identities make reruns safe and idempotent.

`VETTS_DISCOVERY_LIMIT` can temporarily reduce the discovery batch during recovery. Do not increase the seven-day per-tournament bound without reviewing memory and queue impact.
