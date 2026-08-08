#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: verify-vps-postgres-backup.sh <gcs-run-prefix> [--restore-test]

Downloads one run-scoped backup, verifies its checksum and pg_restore catalog,
and optionally restores it into an isolated temporary PostgreSQL database.
The restore-test database name is generated automatically and can never be
the production tt_players database.
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
sudo_bin="${SUDO_BIN:-sudo}"
createdb_bin="${CREATEDB_BIN:-createdb}"
dropdb_bin="${DROPDB_BIN:-dropdb}"
psql_bin="${PSQL_BIN:-psql}"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ttp-db-verify.XXXXXX")
restore_db=""
cleanup() {
  if [[ -n "$restore_db" ]]; then
    "$sudo_bin" -u postgres -- "$dropdb_bin" --if-exists "$restore_db" >/dev/null 2>&1 || true
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

"$pg_restore_bin" --list "$dump_file" >/dev/null
echo "Archive checksum and catalog are valid"

if [[ "$restore_test" == "--restore-test" ]]; then
  restore_db="tt_players_restore_$(date -u +%Y%m%d%H%M%S)_$$"
  "$sudo_bin" -u postgres -- "$createdb_bin" "$restore_db"
  "$sudo_bin" -u postgres -- "$pg_restore_bin" \
    --no-owner \
    --no-acl \
    --dbname="$restore_db" \
    "$dump_file"

  table_count=$("$sudo_bin" -u postgres -- "$psql_bin" \
    "postgresql:///${restore_db}?host=/var/run/postgresql" \
    -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')")
  if [[ ! "$table_count" =~ ^[0-9]+$ ]] || (( table_count == 0 )); then
    echo "Restore completed but no application tables were found" >&2
    exit 1
  fi
  echo "Restore drill succeeded with ${table_count} non-system tables"
fi
