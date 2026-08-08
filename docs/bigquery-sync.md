# TT Players BigQuery replication

This pipeline copies the analytical subset of the production `tt_players` PostgreSQL database into the Terraform-managed BigQuery datasets in project `wudong-agent-master`.

BigQuery is an analytics replica. PostgreSQL remains the authoritative OLTP database, and the GCS PostgreSQL custom-format dump remains the disaster-recovery backup.

## GCP resources

- Location: `us-central1`
- Temporary load bucket: `wudong-agent-master-tt-players-data`
- Temporary prefix: `warehouse-loads/` (1-day lifecycle)
- Raw dataset: `tt_players_raw`
- Pipeline dataset: `tt_players_pipeline`
- Warehouse identity: `tt-players-warehouse-sync`

The warehouse service account can create BigQuery jobs, edit only the TT Players datasets, and create/read/delete only the exact temporary GCS objects it knows below `warehouse-loads/`. It cannot list the bucket or access PostgreSQL backups.

## Replicated data

The checked-in manifest is `scripts/analytics/table-manifest.mjs`.

Daily incremental MERGE tables:

- `external_players`
- `league_standings`
- `fixtures`
- `rubbers`
- `staging.ranking_categories`
- `staging.ranking_periods`
- `staging.ranking_entries`
- `staging.sport80_event_scrape_state`
- `staging.source_events`
- `staging.source_event_result_rows`

Small full-replace tables:

- `platforms`
- `leagues`
- `regions`
- `league_regions`
- `seasons`
- `competitions`
- `teams`

Privacy/operational exclusions:

- `raw_scrape_logs`
- `feedback`
- `feedback_attachments`
- `cache_entries`
- Graphile Worker internals and migration bookkeeping
- raw source fields (`raw_payload`, `round_raw`, `home_raw`, `away_raw`) from source-event tables

The source-event metadata remains useful for reconciliation without copying arbitrary scraped payloads into BigQuery.

## Incremental consistency model

Mutable tables use a tuple high-watermark `(updated_at, id)` plus a one-hour overlap.

For each table the job:

1. reads the last committed watermark from `tt_players_pipeline.sync_watermarks`;
2. captures the source high-watermark;
3. exports rows in the overlap window bounded by that high-watermark;
4. uploads one run-scoped NDJSON object;
5. loads it into a run-scoped staging table using an explicit BigQuery schema;
6. verifies row count, non-null primary keys, and primary-key uniqueness;
7. MERGEs by primary key;
8. advances the watermark only after publication succeeds;
9. records a successful run in `tt_players_pipeline.sync_runs`;
10. drops the staging table and deletes the known temporary GCS object.

A failed destination mutation cannot advance the watermark. Retrying the same overlap is idempotent.

Staging tables also get a 24-hour expiration, and GCS load objects have a 1-day bucket lifecycle, so failed cleanup cannot grow forever.

## Physical layout

High-volume date-bearing tables are partitioned:

- `fixtures`: native `date_played` (`DATE`) partitioning
- `rubbers`: `DATE(played_at)`
- `source_event_result_rows`: `DATE(played_at)`

Frequently filtered identifiers are clustered as declared in the manifest.

MERGE correctness takes priority over unsafe target-partition pruning: the merge matches by immutable primary key without adding a partition predicate that could duplicate a row if its event date changes. Query jobs have a configurable `maximum_bytes_billed` safeguard.

## Credential bootstrap

Follow the operator-only key creation procedure in `wudong/gcloud/docs/tt-players-data.md` and install:

```text
/etc/ttp/tt-players-warehouse-sync.json
```

as `root:root` mode `0600`.

Create `/etc/ttp/tt-players-warehouse.env`, also mode `0600`:

```bash
TTP_GCP_PROJECT=wudong-agent-master
TTP_GCS_BUCKET=wudong-agent-master-tt-players-data
TTP_BQ_LOCATION=us-central1
TTP_BQ_RAW_DATASET=tt_players_raw
TTP_BQ_PIPELINE_DATASET=tt_players_pipeline
TTP_GCS_WAREHOUSE_PREFIX=warehouse-loads
TTP_BQ_MAX_BYTES_BILLED=5000000000
GOOGLE_APPLICATION_CREDENTIALS=/etc/ttp/tt-players-warehouse-sync.json
```

The wrapper creates a private temporary `CLOUDSDK_CONFIG`, activates the service account for `gcloud`/`bq`, and removes that local credential cache at the end of each run. The JSON key remains only in `/etc/ttp/`.

The Google Cloud CLI, including `gcloud` and `bq`, must be installed on the VPS before activation.

## Initial load

Deployment installs the units but does not automatically enable new timers.

First run a full refresh manually:

```bash
sudo systemctl daemon-reload
sudo systemctl start ttp-bigquery-reconcile.service
sudo systemctl status --no-pager ttp-bigquery-reconcile.service
sudo journalctl -u ttp-bigquery-reconcile.service -n 200 --no-pager
```

Then inspect the datasets with an administrator credential:

```bash
bq --project_id=wudong-agent-master --location=us-central1 ls tt_players_raw
bq --project_id=wudong-agent-master --location=us-central1 query --use_legacy_sql=false '
SELECT table_name, row_count
FROM `wudong-agent-master.tt_players_raw.__TABLES__`
ORDER BY table_name'
```

Run the incremental service twice manually to prove idempotency:

```bash
sudo systemctl start ttp-bigquery-sync.service
sudo systemctl start ttp-bigquery-sync.service
```

Review `tt_players_pipeline.sync_runs` and `sync_watermarks`; the second run should either have no changed rows or safely reprocess the overlap without duplicate destination keys.

## Enable schedules

Only after the initial full refresh and repeated incremental run succeed:

```bash
sudo systemctl enable --now ttp-bigquery-sync.timer
sudo systemctl enable --now ttp-bigquery-reconcile.timer
sudo systemctl list-timers 'ttp-bigquery-*' --all
```

Schedules:

- daily incremental sync: 05:00 UTC, up to 10 minutes randomized delay;
- weekly full reconciliation: Sunday 06:00 UTC, up to 15 minutes randomized delay.

Both timers are persistent and catch up after downtime. A shared `flock` prevents the daily and weekly jobs from overlapping.

## Single-table repair

For a targeted table:

```bash
sudo bash /opt/tt-players/current/scripts/run-bigquery-sync.sh --table=rubbers
```

For a full replacement of one table:

```bash
sudo bash /opt/tt-players/current/scripts/run-bigquery-sync.sh --full-refresh --table=rubbers
```

## Failure handling

```bash
sudo systemctl status --no-pager ttp-bigquery-sync.service
sudo journalctl -u ttp-bigquery-sync.service -n 300 --no-pager
```

Do not manually advance a watermark to silence a failure. Fix the cause and rerun; overlap + primary-key MERGE makes retries safe.

If a run fails after a destination MERGE but before watermark commit, the next run repeats the overlap and converges idempotently.

If cleanup fails, the staging table expires after 24 hours and the GCS object expires through the 1-day lifecycle.

## Weekly reconciliation

`ttp-bigquery-reconcile.service` executes `--full-refresh` for every manifest table. This repairs hard-delete drift that cannot be observed from `updated_at` watermarks. Publication is table-by-table atomic: a failed replacement does not publish a partial table.

## Cost controls

- batch GCS loads instead of streaming;
- co-located `us-central1` bucket/datasets;
- partitioning/clustering on the largest date-bearing tables;
- `TTP_BQ_MAX_BYTES_BILLED` on query/DML jobs;
- temporary load retention capped at one day;
- project budget alerts are managed in `wudong/gcloud`.

Increase `TTP_BQ_MAX_BYTES_BILLED` only after reviewing the job estimate and expected monthly query volume.
