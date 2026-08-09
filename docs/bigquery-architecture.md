# BigQuery ingestion architecture

## Purpose

The TT Players BigQuery pipe is a scheduled batch replication pipeline. It
copies the analytical and scraper-observability subset of the production
PostgreSQL database into BigQuery.

PostgreSQL remains the authoritative operational database. BigQuery is an
analytics mirror and is not used as the source for the application API. The
temporary Cloud Storage object is only a transport and staging artifact; it is
not the system of record.

The operational procedures, configuration and rollout gates are documented in
[`bigquery-sync.md`](./bigquery-sync.md). This document explains the
architecture and data flow.

## High-level architecture

```text
Scrapers and application
          |
          v
PostgreSQL: public and staging schemas
          |
          | systemd timer on the production VPS
          v
run-bigquery-sync.sh
  - validates configuration and credentials
  - obtains the single-run lock
  - activates the warehouse service account
          |
          v
sync-bigquery.mjs
  - applies table-manifest rules
  - reads PostgreSQL with COPY TO STDOUT
  - streams newline-delimited JSON
          |
          | bounded resumable upload, 8 MiB chunks
          v
Cloud Storage temporary object
          |
          | BigQuery load job with explicit schema
          v
BigQuery run-scoped staging table
          |
          | row count, null-key and duplicate-key validation
          v
BigQuery raw destination table
  - full replacement for reference tables
  - primary-key MERGE for mutable tables
          |
          +--> tt_players_pipeline.sync_runs
          +--> tt_players_pipeline.validation_results
          +--> tt_players_pipeline.sync_watermarks
```

The implementation is split between:

- [`scripts/run-bigquery-sync.sh`](../scripts/run-bigquery-sync.sh), which
  provides the production wrapper, authentication and concurrency lock;
- [`scripts/analytics/sync-bigquery.mjs`](../scripts/analytics/sync-bigquery.mjs),
  which performs extraction, upload, load, validation, publication and
  cleanup;
- [`scripts/analytics/table-manifest.mjs`](../scripts/analytics/table-manifest.mjs),
  which defines the tables, columns, keys, synchronization modes and physical
  layout;
- [`scripts/analytics/bigquery-sql.mjs`](../scripts/analytics/bigquery-sql.mjs),
  which generates the PostgreSQL export SQL and BigQuery DDL/DML.

## Data ownership and datasets

### PostgreSQL

PostgreSQL owns the live application, scraping and processing data. Scrapers,
workers and the API continue to write and read PostgreSQL as before.

### `tt_players_raw`

This is the BigQuery analytical mirror. It contains 24 allowlisted tables,
including:

- core entities such as leagues, competitions, teams, fixtures, rubbers and
  players;
- ranking tables;
- raw scrape logs;
- source events and source result rows;
- scraper source instances and resources;
- tournament source and match-candidate evidence;
- scraping pipeline run and per-stage history.

User feedback, attachments, cache embeddings, Graphile Worker internals and
migration bookkeeping are excluded.

### `tt_players_pipeline`

This is the pipeline control and audit dataset:

- `sync_runs` records each table attempt, mode, source row count, status and
  completion time;
- `validation_results` records source/staged counts and key-validation
  results;
- `sync_watermarks` records the last successfully published incremental
  position for each mutable table.

## PostgreSQL `staging` schema mapping

The PostgreSQL `staging` schema is replicated as data, but it is not recreated
as a nested BigQuery schema. BigQuery table identifiers have the form:

```text
project.dataset.table
```

They do not have PostgreSQL's separate `database.schema.table` structure. The
current design therefore publishes tables such as:

```text
staging.ranking_entries
staging.raw_scrape_logs
```

as flat tables in:

```text
wudong-agent-master.tt_players_raw
```

The original PostgreSQL schema is retained in the manifest through the
`sourceSchema` property. This preserves source provenance without creating a
second BigQuery dataset and IAM boundary.

## Table synchronization modes

The manifest defines one of two modes for every destination table.

### Full replacement

Small reference tables are exported completely and published with a table
replacement. The current full-replace group includes platforms, leagues,
regions, league regions, seasons, competitions and teams.

Full replacement also means that hard deletions in PostgreSQL disappear from
the BigQuery destination on the next full run.

### Incremental merge

Mutable tables are exported using a high-watermark and merged by primary key.
The current incremental group includes fixtures, rubbers, rankings, raw scrape
logs, source data, tournament provenance and scraper pipeline history.

An incremental table normally uses:

```text
(updated_at, id)
```

as its ordered watermark. The two scraping pipeline-run tables use
`(updated_at, run_key)` because their natural identifier is a string.

The pipeline also preserves soft-delete columns such as `deleted_at`. A hard
deletion that leaves no source row cannot be discovered by an incremental
query, which is why the full reconciliation remains part of the architecture.

## End-to-end run

### 1. Scheduling and locking

The daily incremental and weekly full-reconciliation jobs are systemd oneshot
services started by persistent timers. The wrapper obtains a shared `flock` so
the two jobs cannot update the warehouse concurrently.

The wrapper activates the root-only warehouse credential into a temporary
private Cloud SDK configuration. That temporary configuration is deleted when
the run exits.

### 2. Selecting the source rows

For each manifest entry, the synchronizer builds a PostgreSQL query with the
declared columns and explicit type conversions.

For a full replacement, the query reads the complete source table.

For an incremental merge, the synchronizer:

1. reads the last committed watermark from
   `tt_players_pipeline.sync_watermarks`;
2. captures the current source high-watermark;
3. moves the lower boundary back by the configured one-hour overlap;
4. exports rows between the overlap-adjusted lower bound and the captured
   upper bound.

The upper bound is important. Rows written after it are deliberately left for
the next run instead of being exposed to a moving query boundary.

### 3. Streaming the PostgreSQL export

The export uses PostgreSQL `COPY (...) TO STDOUT`. Each selected row is
serialized as one JSON object per line.

The process does not materialize the complete result as a `PGresult`, a Node.js
array or a local dump file. This keeps memory bounded even for large tables.

Timestamps are normalized to UTC. JSONB fields, including competition
category metadata and raw scraper payloads, are preserved as canonical JSON
text so the source information is not silently lost or flattened into an
unstable schema.

### 4. Uploading through Cloud Storage

The stream is sent to a run-scoped newline-delimited JSON object under the
warehouse load prefix in the production bucket.

The upload uses a Cloud Storage resumable session and bounded 8 MiB
`Content-Range` chunks. The VPS only holds request metadata and the current
chunk; it does not hold the complete export.

The service account uses known object names and does not need bucket-list
permission. The object is deleted after processing when possible, and the
bucket lifecycle policy provides eventual cleanup if a process fails before
deletion.

### 5. Loading a BigQuery staging table

BigQuery loads the GCS object using the explicit schema generated from the
manifest. The load target is a unique, run-scoped temporary table in
`tt_players_raw`.

Temporary staging tables expire after a short period so an interrupted run
cannot leave unbounded warehouse clutter.

### 6. Validating before publication

Before touching the destination table, the synchronizer checks:

- the staged row count matches the number of exported source rows;
- every primary-key column is non-null;
- the primary key, including composite keys, is unique.

The result is inserted into `tt_players_pipeline.validation_results` before
publication. A failed check stops that table's run and leaves its previous
published contents in place.

### 7. Publishing the destination

For a full-replace table, the validated staging table becomes the new
destination table.

For an incremental table, the validated rows are deduplicated by primary key
and merged into the destination. Existing keys are updated and new keys are
inserted.

Only after the destination mutation succeeds does the synchronizer commit the
new watermark and a successful row in `tt_players_pipeline.sync_runs`.

The ordering is therefore:

```text
export -> load -> validate -> publish -> commit watermark
```

If any earlier step fails, the watermark does not advance. A retry can safely
reprocess the overlap because the destination operation is an idempotent
primary-key merge.

### 8. Cleanup

The run drops its temporary BigQuery staging table and deletes its known GCS
object. Cleanup failures are logged, but expiration policies provide a bounded
fallback for both resource types.

## Partitioning and query cost controls

Large date-bearing tables are partitioned and commonly filtered identifiers
are clustered. Examples include:

- monthly partitioning for `fixtures` by `date_played`;
- date partitioning for `rubbers` and source result rows;
- date partitioning for `raw_scrape_logs` by `scraped_at`.

BigQuery query jobs use a configurable maximum-bytes-billed limit. This is a
guardrail against accidentally running an unexpectedly expensive query. It
does not change the source-of-truth or publication model.

## Security boundaries

The warehouse credential is installed on the production VPS as a root-owned,
mode-0600 file. The warehouse identity is scoped to:

- creating BigQuery jobs;
- the two TT Players BigQuery datasets;
- the exact temporary objects used by the warehouse load process.

It does not access PostgreSQL backup objects and does not require permission to
list the GCS bucket.

The raw dataset contains upstream response bodies and other scraper payloads.
It must therefore be treated as sensitive operational data and should not be
exposed as a public application API.

## Architectural guarantees

The design provides these guarantees:

- PostgreSQL remains authoritative if BigQuery is unavailable;
- a failed export or validation cannot replace a good destination table;
- a failed publication cannot advance the incremental watermark;
- retrying the overlap is safe and does not create duplicate primary keys;
- rows committed after the run's upper boundary are picked up by a later run;
- the weekly full reconciliation can correct hard deletions and drift in
  full-replace tables;
- GCS and local memory usage remain bounded for large exports;
- every attempted table run and validation result is queryable in BigQuery.

## Summary

The complete path is:

```text
PostgreSQL
  -> COPY TO STDOUT
  -> streamed NDJSON
  -> temporary GCS object
  -> BigQuery temporary staging table
  -> row/key validation
  -> full replacement or primary-key MERGE
  -> watermark and audit metadata
  -> cleanup
```

This makes BigQuery a reliable, queryable analytical and scraper-observability
mirror while keeping the production application dependent only on PostgreSQL.
