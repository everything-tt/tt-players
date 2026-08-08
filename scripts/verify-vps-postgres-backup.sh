#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: verify-vps-postgres-backup.sh <gcs-run-prefix> [--restore-test]

Downloads one run-scoped backup, verifies its checksum, success metadata, and
pg_restore catalog, and optionally restores it into an isolated temporary
PostgreSQL database. The restore-test database name is generated automatically
and can never be the production tt_players database.
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

run_prefix="${1%/}"
restore_test="${2:-}"
if [[ -n "$restore_test" && "$restore_test" != "--restore-test" ]]; then
  usage >&2
  exit 2
fi
if [[ "$run_prefix" != gs://* ]]; then
  echo "Backup prefix must be a gs:// URI" >&2
  exit 2
fi

gcloud_bin="${GCLOUD_BIN:-gcloud}"
pg_restore_bin="${PG_RESTORE_BIN:-pg_restore}"
sha256_bin="${SHA256_BIN:-sha256sum}"
node_bin="${NODE_BIN:-node}"
sudo_bin="${SUDO_BIN:-sudo}"
createdb_bin="${CREATEDB_BIN:-createdb}"
dropdb_bin="${DROPDB_BIN:-dropdb}"
psql_bin="${PSQL_BIN:-psql}"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ttp-db-verify.XXXXXX")
restore_db=""

run_as_postgres() {
  if [[ "${TTP_VERIFY_SKIP_SUDO:-0}" == "1" ]]; then
    "$@"
  else
    "$sudo_bin" -u postgres -- "$@"
  fi
}

cleanup() {
  if [[ -n "$restore_db" ]]; then
    run_as_postgres "$dropdb_bin" --if-exists "$restore_db" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT INT TERM

dump_file="$tmp_dir/database.dump"
checksum_file="$tmp_dir/database.sha256"
metadata_file="$tmp_dir/metadata.json"

"$gcloud_bin" storage cp "${run_prefix}/database.dump" "$dump_file" --quiet
"$gcloud_bin" storage cp "${run_prefix}/database.sha256" "$checksum_file" --quiet
"$gcloud_bin" storage cp "${run_prefix}/metadata.json" "$metadata_file" --quiet

expected_checksum=$(tr -d '[:space:]' < "$checksum_file")
actual_checksum=$("$sha256_bin" "$dump_file" | awk '{print $1}')
if [[ -z "$expected_checksum" || "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Backup checksum mismatch" >&2
  exit 1
fi

dump_bytes=$(stat --printf='%s' "$dump_file")
expected_run_id="${run_prefix##*/}"
"$node_bin" -e '
const fs = require("node:fs");
const [metadataPath, checksum, dumpBytesText, expectedRunId] = process.argv.slice(1);
let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
} catch (error) {
  console.error(`Backup metadata is not valid JSON: ${error.message}`);
  process.exit(1);
}
const failures = [];
if (metadata.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (metadata.status !== "succeeded") failures.push("status must be succeeded");
if (metadata.database !== "tt_players") failures.push("database must be tt_players");
if (metadata.runId !== expectedRunId) failures.push("runId does not match the requested backup prefix");
if (metadata.sha256 !== checksum) failures.push("metadata SHA-256 does not match database.dump");
if (metadata.dumpBytes !== Number(dumpBytesText)) failures.push("metadata dumpBytes does not match database.dump");
if (typeof metadata.createdAt !== "string" || metadata.createdAt.length === 0) failures.push("createdAt is required");
if (failures.length > 0) {
  for (const failure of failures) console.error(`Backup metadata validation failed: ${failure}`);
  process.exit(1);
}
' "$metadata_file" "$actual_checksum" "$dump_bytes" "$expected_run_id"

"$pg_restore_bin" --list "$dump_file" >/dev/null
echo "Archive checksum, metadata, and catalog are valid"

if [[ "$restore_test" == "--restore-test" ]]; then
  restore_db="tt_players_restore_$(date -u +%Y%m%d%H%M%S)_$$"
  run_as_postgres "$createdb_bin" "$restore_db"
  run_as_postgres "$pg_restore_bin" \
    --no-owner \
    --no-acl \
    --dbname="$restore_db" < "$dump_file"

  restore_url="postgresql:///${restore_db}?host=/var/run/postgresql"
  required_nonempty_tables=(
    "public.kysely_migration"
    "public.external_players"
    "public.fixtures"
    "public.rubbers"
    "staging.ranking_entries"
  )

  for qualified_table in "${required_nonempty_tables[@]}"; do
    schema_name="${qualified_table%%.*}"
    table_name="${qualified_table#*.}"
    exists=$(run_as_postgres "$psql_bin" "$restore_url" -v ON_ERROR_STOP=1 -Atqc \
      "SELECT to_regclass('${qualified_table}') IS NOT NULL")
    if [[ "$exists" != "t" ]]; then
      echo "Restore validation failed: required table ${qualified_table} is missing" >&2
      exit 1
    fi

    row_count=$(run_as_postgres "$psql_bin" "$restore_url" -v ON_ERROR_STOP=1 -Atqc \
      "SELECT count(*) FROM \"${schema_name}\".\"${table_name}\"")
    if [[ ! "$row_count" =~ ^[0-9]+$ ]] || (( row_count == 0 )); then
      echo "Restore validation failed: required table ${qualified_table} has no rows" >&2
      exit 1
    fi
    echo "Restore baseline: ${qualified_table}=${row_count} rows"
  done

  echo "Restore drill succeeded; critical application tables and migration state are present"
fi
