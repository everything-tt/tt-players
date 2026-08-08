# TT Players PostgreSQL backup

Production PostgreSQL remains the source of truth. BigQuery is an analytics replica, **not** the disaster-recovery backup. This runbook creates and verifies a directly restorable PostgreSQL custom-format archive in the dedicated Google Cloud Storage bucket.

## GCP contract

The infrastructure is managed in `wudong/gcloud` and uses project `wudong-agent-master`.

- Bucket default: `wudong-agent-master-tt-players-data`
- Location: `us-central1`
- Backup prefix: `backups/postgres/`
- Retention: 7 calendar days
- Backup identity: `tt-players-backup-writer`
- IAM: create-only below the backup prefix; it cannot read, list, delete, or overwrite objects

Object names are immutable and run-scoped:

```text
backups/postgres/<run-id>/database.dump
backups/postgres/<run-id>/database.sha256
backups/postgres/<run-id>/metadata.json
```

`metadata.json` is uploaded last and is the success marker for a completed run.

## One-time credential bootstrap

Terraform deliberately does not create or store service-account private keys. Until the external VPS workload is migrated to Workload Identity Federation, create the backup credential using the operator-only procedure in `wudong/gcloud/docs/tt-players-data.md`, then install it as:

```text
/etc/ttp/tt-players-backup-writer.json
```

owned by `root:root` with mode `0600`.

Create `/etc/ttp/tt-players-backup.env`, also `root:root` mode `0600`:

```bash
TTP_GCS_BUCKET=wudong-agent-master-tt-players-data
CLOUDSDK_CORE_PROJECT=wudong-agent-master
GOOGLE_APPLICATION_CREDENTIALS=/etc/ttp/tt-players-backup-writer.json
```

Do not put either file in Git, a release directory, GitHub Actions artifacts, Terraform state, or logs.

## Deployment behavior

Application deployment installs the backup service and timer and reloads systemd. It intentionally **does not enable a new timer automatically**. A backup must be run and restored successfully before scheduling is enabled.

If the timer was already enabled from a previous verified deployment, installing an updated unit does not disable it.

## First production backup

Validate the credential file and environment without printing their contents:

```bash
sudo test -s /etc/ttp/tt-players-backup-writer.json
sudo test -s /etc/ttp/tt-players-backup.env
sudo systemctl daemon-reload
sudo systemctl start ttp-db-backup.service
sudo systemctl status --no-pager ttp-db-backup.service
sudo journalctl -u ttp-db-backup.service -n 100 --no-pager
```

The final log line contains the run prefix and `metadata.json` object path.

Because the backup writer is intentionally create-only, an administrator or separate read-capable operator credential is required to download and verify a backup.

## Restore drill

With an operator credential that can read the backup objects:

```bash
sudo bash /opt/tt-players/current/scripts/verify-vps-postgres-backup.sh \
  gs://wudong-agent-master-tt-players-data/backups/postgres/<run-id> \
  --restore-test
```

The verifier downloads the dump/checksum/metadata, checks the SHA-256 and success metadata, validates the archive catalog, restores into an automatically generated `tt_players_restore_*` database, verifies migration state plus non-empty critical `external_players`, `fixtures`, `rubbers`, and `staging.ranking_entries` tables, and drops the temporary database on exit. It never accepts a caller-provided restore database name, so it cannot overwrite `tt_players`.

Record the successful run ID and restore date. Repeat a real restore drill at least quarterly.

## Enable the daily timer

Only after the first backup and restore drill succeed:

```bash
sudo systemctl enable --now ttp-db-backup.timer
sudo systemctl list-timers ttp-db-backup.timer --all
```

The timer runs daily at **04:30 UTC**, with up to five minutes of randomized delay, after the normal scrape window. `Persistent=true` catches up after downtime.

## Failure handling

A failed dump, archive validation, checksum/metadata generation, or upload causes the systemd unit to fail non-zero. No metadata success marker is uploaded unless the dump and checksum uploads both succeed.

```bash
sudo systemctl status --no-pager ttp-db-backup.service
sudo journalctl -u ttp-db-backup.service -n 200 --no-pager
```

Do not weaken the bucket IAM to make retries easier. A retry always creates a new run ID and cannot overwrite a previous successful backup.

## Rotation

Rotate the backup service-account key one identity at a time using the procedure in `wudong/gcloud/docs/tt-players-data.md`. Install the new file atomically at the same path, run one manual backup, and revoke the old key only after the new credential succeeds.
