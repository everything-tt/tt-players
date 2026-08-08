#!/usr/bin/env bash
set -euo pipefail

gcloud_bin="${GCLOUD_BIN:-gcloud}"
node_bin="${NODE_BIN:-node}"
lock_file="${TTP_BIGQUERY_LOCK_FILE:-/run/lock/ttp-bigquery-sync.lock}"
credential_file="${GOOGLE_APPLICATION_CREDENTIALS:-}"

if [[ -z "$credential_file" || ! -r "$credential_file" ]]; then
  echo "GOOGLE_APPLICATION_CREDENTIALS must point to a readable warehouse service-account key" >&2
  exit 2
fi
if [[ -z "${TTP_GCP_PROJECT:-}" || -z "${TTP_GCS_BUCKET:-}" ]]; then
  echo "TTP_GCP_PROJECT and TTP_GCS_BUCKET are required" >&2
  exit 2
fi

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another TT Players BigQuery sync is already running" >&2
  exit 75
fi

cloudsdk_config=$(mktemp -d "${TMPDIR:-/tmp}/ttp-bigquery-gcloud.XXXXXX")
cleanup() {
  rm -rf -- "$cloudsdk_config"
}
trap cleanup EXIT INT TERM

export CLOUDSDK_CONFIG="$cloudsdk_config"
chmod 0700 "$CLOUDSDK_CONFIG"
"$gcloud_bin" auth activate-service-account \
  --key-file="$credential_file" \
  --project="$TTP_GCP_PROJECT" \
  --quiet >/dev/null

"$node_bin" /opt/tt-players/current/scripts/analytics/sync-bigquery.mjs "$@"
