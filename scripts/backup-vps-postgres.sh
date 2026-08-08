#!/usr/bin/env bash
set -euo pipefail

pg_dump_bin="${PG_DUMP_BIN:-pg_dump}"
pg_restore_bin="${PG_RESTORE_BIN:-pg_restore}"
psql_bin="${PSQL_BIN:-psql}"
gcloud_bin="${GCLOUD_BIN:-gcloud}"
curl_bin="${CURL_BIN:-curl}"
sha256_bin="${SHA256_BIN:-sha256sum}"
node_bin="${NODE_BIN:-node}"
sudo_bin="${SUDO_BIN:-sudo}"
lock_file="${TTP_BACKUP_LOCK_FILE:-/run/lock/ttp-db-backup.lock}"
database_url="${DATABASE_URL:-postgresql:///tt_players?host=/var/run/postgresql}"
bucket="${TTP_GCS_BUCKET:-}"
prefix="${TTP_GCS_BACKUP_PREFIX:-backups/postgres}"
release_metadata="${TTP_RELEASE_METADATA_FILE:-/opt/tt-players/current/.release-metadata}"

if [[ -z "$bucket" ]]; then
  echo "TTP_GCS_BUCKET is required" >&2
  exit 2
fi

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another TT Players database backup is already running" >&2
  exit 75
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ttp-db-backup.XXXXXX")
cleanup() {
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT INT TERM

timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(date -u +%s%N)-$$"
object_prefix="gs://${bucket}/${prefix%/}/${run_id}"
dump_file="$tmp_dir/database.dump"
checksum_file="$tmp_dir/database.sha256"
metadata_file="$tmp_dir/metadata.json"

credential_file="${GOOGLE_APPLICATION_CREDENTIALS:-}"
if [[ "${TTP_GCLOUD_SKIP_AUTH:-0}" != "1" ]]; then
  if [[ -z "$credential_file" || ! -r "$credential_file" ]]; then
    echo "GOOGLE_APPLICATION_CREDENTIALS must point to a readable service-account key" >&2
    exit 2
  fi
  export CLOUDSDK_CONFIG="$tmp_dir/gcloud-config"
  mkdir -m 0700 "$CLOUDSDK_CONFIG"
  "$gcloud_bin" auth activate-service-account \
    --key-file="$credential_file" \
    ${CLOUDSDK_CORE_PROJECT:+--project="$CLOUDSDK_CORE_PROJECT"} \
    --quiet >/dev/null
fi

run_as_postgres() {
  if [[ "${TTP_BACKUP_SKIP_SUDO:-0}" == "1" ]]; then
    "$@"
  else
    "$sudo_bin" -u postgres -- "$@"
  fi
}

release_sha="unknown"
if [[ -r "$release_metadata" ]]; then
  release_sha=$(sed -n 's/^commit_sha=//p' "$release_metadata" | head -n 1)
  release_sha="${release_sha:-unknown}"
fi

echo "Creating PostgreSQL backup for tt_players at ${timestamp}"
run_as_postgres "$pg_dump_bin" \
  --dbname="$database_url" \
  --format=custom \
  --no-owner \
  --no-acl \
  --compress=6 > "$dump_file"

"$pg_restore_bin" --list "$dump_file" >/dev/null

checksum=$("$sha256_bin" "$dump_file" | awk '{print $1}')
printf '%s\n' "$checksum" > "$checksum_file"

database_bytes=$(run_as_postgres "$psql_bin" "$database_url" -Atqc \
  'SELECT pg_database_size(current_database())')
dump_bytes=$(stat --printf='%s' "$dump_file")
postgres_version=$("$pg_dump_bin" --version | head -n 1)

BACKUP_TIMESTAMP="$timestamp" \
BACKUP_RUN_ID="$run_id" \
BACKUP_DATABASE_BYTES="$database_bytes" \
BACKUP_DUMP_BYTES="$dump_bytes" \
BACKUP_RELEASE_SHA="$release_sha" \
BACKUP_SHA256="$checksum" \
BACKUP_POSTGRES_VERSION="$postgres_version" \
"$node_bin" -e '
const fs = require("node:fs");
const metadata = {
  schemaVersion: 1,
  status: "succeeded",
  createdAt: process.env.BACKUP_TIMESTAMP,
  runId: process.env.BACKUP_RUN_ID,
  database: "tt_players",
  databaseBytes: Number(process.env.BACKUP_DATABASE_BYTES),
  dumpBytes: Number(process.env.BACKUP_DUMP_BYTES),
  releaseSha: process.env.BACKUP_RELEASE_SHA,
  sha256: process.env.BACKUP_SHA256,
  postgresVersion: process.env.BACKUP_POSTGRES_VERSION
};
fs.writeFileSync(process.argv[1], `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
' "$metadata_file"

# metadata.json is deliberately uploaded last. Its presence is the success marker
# for a run-scoped prefix; a failed partial upload is never advertised as complete.
# The backup writer is intentionally limited to storage.objects.create. The
# Cloud SDK copy command performs a destination GET even with a generation
# precondition, so use the JSON API media upload directly. An ifGenerationMatch
# value of zero makes each run-scoped object immutable without requiring read,
# list, delete, or overwrite permission.
access_token="${TTP_GCS_ACCESS_TOKEN:-}"
if [[ -z "$access_token" ]]; then
  access_token=$("$gcloud_bin" auth print-access-token)
fi
if [[ -z "$access_token" ]]; then
  echo "Unable to obtain a Google Cloud access token" >&2
  exit 1
fi

curl_config="$tmp_dir/curl.conf"
printf 'header = "Authorization: Bearer %s"\n' "$access_token" > "$curl_config"
chmod 600 "$curl_config"

upload_object() {
  local source_file="$1"
  local object_name="$2"
  local encoded_object_name

  encoded_object_name=$("$node_bin" -e \
    'process.stdout.write(encodeURIComponent(process.argv[1]))' \
    "$object_name")
  "$curl_bin" \
    --fail \
    --silent \
    --show-error \
    --config "$curl_config" \
    --header 'Content-Type: application/octet-stream' \
    --request POST \
    --upload-file "$source_file" \
    "https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encoded_object_name}&ifGenerationMatch=0" \
    >/dev/null
}

upload_object "$dump_file" "${prefix%/}/${run_id}/database.dump"
upload_object "$checksum_file" "${prefix%/}/${run_id}/database.sha256"
upload_object "$metadata_file" "${prefix%/}/${run_id}/metadata.json"

echo "Backup completed: ${object_prefix}/metadata.json"
