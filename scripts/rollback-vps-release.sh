#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: rollback-vps-release.sh <previous|commit-sha-or-prefix>

Rolls the TT Players API and worker back to an already deployed release.
The operation is refused when:
  * the current release contains a database update;
  * the target has a different database fingerprint;
  * the target never passed deployment health checks.
USAGE
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

target_ref=$1
if [[ "$target_ref" != previous && ! "$target_ref" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "Target must be 'previous' or a 7-40 character hexadecimal commit SHA/prefix." >&2
  exit 2
fi

root_dir=/opt/tt-players
current_link="$root_dir/current"
previous_link="$root_dir/previous"

read_metadata_value() {
  local file=$1
  local key=$2
  sed -n "s/^${key}=//p" "$file" | head -n 1
}

if [[ ! -L "$current_link" ]]; then
  echo "No versioned current release is installed." >&2
  exit 1
fi

current_release=$(readlink -f "$current_link")
current_metadata="$current_release/.release-metadata"
if [[ ! -f "$current_metadata" ]]; then
  echo "Current release has no metadata: $current_release" >&2
  exit 1
fi

current_rollback_allowed=$(read_metadata_value "$current_metadata" rollback_allowed)
current_db_fingerprint=$(read_metadata_value "$current_metadata" db_fingerprint)
current_sha=$(read_metadata_value "$current_metadata" commit_sha)

if [[ "$current_rollback_allowed" != true ]]; then
  echo "Rollback is disabled because the current release crossed a database migration boundary." >&2
  echo "Deploy a newer compatible release instead." >&2
  exit 1
fi

if [[ "$target_ref" == previous ]]; then
  if [[ ! -L "$previous_link" ]]; then
    echo "No previous compatible release is recorded." >&2
    exit 1
  fi
  target_release=$(readlink -f "$previous_link")
else
  shopt -s nullglob
  matches=("$root_dir/releases/$target_ref"*)
  shopt -u nullglob
  if (( ${#matches[@]} == 0 )); then
    echo "No deployed release matches: $target_ref" >&2
    exit 1
  fi
  if (( ${#matches[@]} > 1 )); then
    echo "Release prefix is ambiguous: $target_ref" >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 1
  fi
  target_release=$(readlink -f "${matches[0]}")
fi

if [[ "$target_release" == "$current_release" ]]; then
  echo "Target is already the current release: $current_sha"
  exit 0
fi

if [[ ! -f "$target_release/.deployed-ok" ]]; then
  echo "Target release did not complete a successful deployment: $target_release" >&2
  exit 1
fi

target_metadata="$target_release/.release-metadata"
if [[ ! -f "$target_metadata" ]]; then
  echo "Target release has no metadata: $target_release" >&2
  exit 1
fi

target_db_fingerprint=$(read_metadata_value "$target_metadata" db_fingerprint)
target_sha=$(read_metadata_value "$target_metadata" commit_sha)

if [[ -z "$current_db_fingerprint" || -z "$target_db_fingerprint" ]]; then
  echo "Missing database fingerprint; refusing an unsafe rollback." >&2
  exit 1
fi

if [[ "$current_db_fingerprint" != "$target_db_fingerprint" ]]; then
  echo "Rollback refused: target release belongs to a different database schema boundary." >&2
  echo "Current: $current_sha ($current_db_fingerprint)" >&2
  echo "Target:  $target_sha ($target_db_fingerprint)" >&2
  echo "Deploy a newer compatible release instead." >&2
  exit 1
fi

restore_current() {
  echo "Rollback target failed health checks; restoring $current_sha" >&2
  ln -sfn "$current_release" "$root_dir/current.restore"
  mv -Tf "$root_dir/current.restore" "$current_link"
  ln -sfn "$target_release" "$previous_link"
  systemctl restart ttp-api ttp-worker
}
trap restore_current ERR

systemctl stop ttp-worker ttp-api
ln -sfn "$target_release" "$root_dir/current.rollback"
mv -Tf "$root_dir/current.rollback" "$current_link"
ln -sfn "$current_release" "$previous_link"

systemctl start ttp-api ttp-worker
sleep 10
systemctl is-active --quiet ttp-api
systemctl is-active --quiet ttp-worker
curl --fail --silent --show-error http://127.0.0.1:3005/api/health >/dev/null

trap - ERR

echo "Rolled back from $current_sha to $target_sha"
