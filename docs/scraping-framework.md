# Scraping framework hardening

This document records the operational invariants established by issue #252. New sources and scraper changes should preserve these contracts rather than reintroducing source-specific shortcuts.

## Core invariants

### Extract, store, then transform

Raw responses are durable evidence. Transform/load code must be replayable from stored evidence and must not make hidden HTTP requests. If transformation needs another source document, extraction stores that document first and records the dependency between the parent log and evidence log.

Raw evidence identity is source/request/content aware. A request fingerprint captures stable request semantics while excluding volatile credentials/session values. Source-resource identity and adapter version may be recorded with the evidence.

### Idempotent, replica-safe writes

Canonical loader writes use database-enforced UPSERT identities. Large collections are written in bounded batches inside the same transaction. A retry or concurrent worker must converge rather than create duplicate teams, players, fixtures, rubbers, standings, competitions, source events, or review candidates.

Scraper refreshes are monotonic for completed fixture state: stale source snapshots cannot reopen a completed fixture. Reopening/correction belongs to explicit recovery/domain operations.

Successful raw evidence and source-health state cannot be downgraded by a late stale failure from another worker.

### Distributed source throttling

Production HTTP clients acquire source-key request leases from `staging.source_request_limits`. The lease is shared across worker replicas, so horizontal scaling does not multiply upstream request rate. Lease release is token-conditional and 429/`Retry-After` cooldown is shared between replicas.

The active external clients using the shared gate are:

| Source | Client boundary | Request identity / scope | Distributed gate |
|---|---|---|---|
| TT Leagues | `ttleagues-http.ts` | tenant-sensitive request fingerprint | `ttleagues-api` |
| TT365 | `tt365-http.ts` | URL/request fingerprint | `tt365` |
| Sport80 | `sport80-client.ts` | source/request evidence | `sport80` |
| VETTS Tournament Software | `vetts-client.ts` | persisted source resources | `vetts` |
| TTE calendar | `tte-events-client.ts` | calendar source key | `tte-calendar` |

## Source capability matrix

| Source | Discovery | Raw evidence | Deterministic transform | Persisted resource health | Refresh policy | Pagination/completeness |
|---|---|---|---|---|---|---|
| TT Leagues | league/division/match jobs | yes | yes | canonical/staged ingestion state | fixture/result recheck policy | bounded match/set batches |
| TT365 | standings/fixtures/match-card/player-stat evidence | yes | yes; match-card fallback evidence is pre-fetched | raw evidence + task state | upcoming/postponed/result rechecks | resource-specific pages |
| Sport80 | paged event discovery | yes | yes | `sport80_event_scrape_state` | processed results refresh after configured interval | follows reported total; short/empty incomplete pages fail |
| VETTS | persisted tournament resources | yes | yes | `source_resources` | central cadence scheduler | complete inclusive event date range; over-limit spans fail |
| TTE calendar | archive/detail discovery | source metadata + tournament source rows | yes | tournament source missing-count lifecycle | calendar window sync | malformed details are quarantined; missing events age through lifecycle |

Unsupported adapters in the common persisted-resource scheduler are reported explicitly; they are not counted as successfully scheduled.

## Ingestion completion

The daily publication barrier considers staged evidence/resource state in addition to Graphile Worker jobs. Ratings/read-model publication must not advance while current-window raw evidence or staged source resources remain pending or permanently failed.

Global player reconciliation is an explicit pipeline stage. Individual scrape-log processing must never run a global reconciliation scan.

## Bounded database writes

`DB_LOAD_CHUNK_SIZE` controls canonical loader write batches.

- default: `250`
- hard maximum: `1000`

Chunking occurs inside the load transaction, so statement size is bounded without weakening atomicity.

The scale regression exercises 100 teams, 1,200 players, 600 fixtures and 1,200 rubbers through 37-row batches and replays the load to verify idempotency.

## Freshness and retries

Freshness is time-based, not equivalent to `processed forever`.

Sport80 processed event results use `SPORT80_PROCESSED_REFRESH_MS` with a default of seven days. Pending and failed resources remain immediately retryable, and an explicit force request overrides freshness.

Persisted `source_resources` use their `refresh_policy` through the common due-resource scheduler. Existing cadence values are interpreted centrally and failing resources receive bounded retry backoff.

## Raw evidence retention

Raw scrape retention is status-aware and bounded.

| Setting | Default |
|---|---:|
| `RAW_SCRAPE_PROCESSED_RETENTION_DAYS` | 90 days |
| `RAW_SCRAPE_FAILED_RETENTION_DAYS` | 365 days |
| `RAW_SCRAPE_RETENTION_BATCH_SIZE` | 500 rows |

The cleanup task never prunes pending evidence. Any raw row referenced as either side of a deterministic evidence dependency is protected from deletion. Cleanup uses `FOR UPDATE ... SKIP LOCKED` and a hard batch cap so maintenance can run concurrently without becoming an unbounded workload.

## Discovery completeness rules

Safety limits must fail closed; they must never silently turn a partial discovery into a successful complete run.

Sport80 event discovery follows the API-reported `total`. An empty/short intermediate page while the source claims more rows is an error. An explicitly supplied diagnostic `maxPages` also errors if it would truncate discovery.

VETTS result discovery enumerates the complete inclusive event date range. The large-span guard rejects an implausibly long range rather than returning only the first dates.

## Source registry and scheduling

`source_instances` represents a configured source/provider instance. `source_resources` represents refreshable resources with adapter version, resource type, external identity, refresh policy and health timestamps/counters.

The common due-resource scheduler:

1. selects enabled resources from enabled source instances;
2. interprets their refresh policy centrally;
3. determines due resources from success time and failure state;
4. maps supported adapters to stable Graphile jobs;
5. uses stable job keys so repeated scheduler runs converge;
6. reports unsupported adapters explicitly.

VETTS is the first persisted adapter routed through this common scheduler. Other sources may migrate incrementally without bypassing the existing correctness and throttling contracts.

## Release gate

`apps/worker/src/__tests__/scraping-hardening-release-gate.test.ts` is the consolidated architecture regression gate for #252. It protects the important boundaries: deterministic transforms, explicit reconciliation, staged ingestion completion, bounded/replica-safe loading, distributed HTTP throttling, fail-closed discovery, replay-safe retention, persisted-resource scheduling and startup source independence.

When adding a scraper or changing ingestion architecture, update the capability matrix and extend the release gate when a new invariant is introduced.
