#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: deploy-vps-release.sh <release-dir> <commit-sha> <db-fingerprint> <database-changed:true|false>

Prepares and activates a versioned TT Players release on the VPS.
Database-changing deployments create a rollback boundary and cannot be rolled back.
USAGE
}

if [[ $# -ne 4 ]]; then
  usage >&2
  exit 2
fi

release_dir=$(readlink -f "$1")
commit_sha=$2
db_fingerprint=$3
database_changed=$4
root_dir=/opt/tt-players
current_link="$root_dir/current"
previous_link="$root_dir/previous"
metadata_file="$release_dir/.release-metadata"
bun_bin="${BUN_BIN:-/usr/local/bin/bun}"

case "$database_changed" in
  true|false) ;;
  *)
    echo "database-changed must be true or false" >&2
    exit 2
    ;;
esac

if [[ ! -d "$release_dir" ]]; then
  echo "Release directory does not exist: $release_dir" >&2
  exit 1
fi

if [[ "$release_dir" != "$root_dir"/releases/* ]]; then
  echo "Release must be under $root_dir/releases" >&2
  exit 1
fi

current_release=""
if [[ -L "$current_link" ]]; then
  current_release=$(readlink -f "$current_link")
fi

rollback_allowed=true
if [[ "$database_changed" == true ]]; then
  rollback_allowed=false
fi

cat > "$metadata_file" <<EOF_METADATA
commit_sha=$commit_sha
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
db_fingerprint=$db_fingerprint
database_changed=$database_changed
rollback_allowed=$rollback_allowed
EOF_METADATA

(cd "$release_dir" && CI=true pnpm install --frozen-lockfile)
chown -R ttp:ttp "$release_dir"
chmod -R u+rwX,go+rX "$release_dir"

if [[ "$database_changed" == true ]]; then
  sudo -u postgres env \
    DATABASE_URL='postgresql:///tt_players?host=/var/run/postgresql' \
    "$bun_bin" "$release_dir/packages/db/src/migration-preflight.ts"
fi

install -m 0644 "$release_dir/infra/systemd/ttp-api.service" /etc/systemd/system/ttp-api.service
install -m 0644 "$release_dir/infra/systemd/ttp-worker.service" /etc/systemd/system/ttp-worker.service
systemctl daemon-reload

# A database migration is a forward-only boundary. Stop both services before
# applying it, and remove the previous pointer so operators cannot accidentally
# select a pre-migration release.
if [[ "$database_changed" == true ]]; then
  systemctl stop ttp-worker ttp-api || true
  sudo -u postgres env \
    DATABASE_URL='postgresql:///tt_players?host=/var/run/postgresql' \
    bash "$release_dir/scripts/migrate-vps-postgres.sh"
  rm -f "$previous_link"
elif [[ -n "$current_release" && "$current_release" != "$release_dir" ]]; then
  ln -sfn "$current_release" "$previous_link"
fi

ln -sfn "$release_dir" "$root_dir/current.new"
mv -Tf "$root_dir/current.new" "$current_link"

systemctl restart ttp-api ttp-worker
sleep 10
systemctl is-active --quiet ttp-api
systemctl is-active --quiet ttp-worker
curl --fail --silent --show-error http://127.0.0.1:3005/api/health >/dev/null

touch "$release_dir/.deployed-ok"

# Keep the current/previous releases plus the five most recently modified
# additional releases. Never remove a release referenced by a symlink.
current_real=$(readlink -f "$current_link")
previous_real=""
if [[ -L "$previous_link" ]]; then
  previous_real=$(readlink -f "$previous_link")
fi

mapfile -t release_dirs < <(find "$root_dir/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
kept=0
for candidate in "${release_dirs[@]}"; do
  candidate_real=$(readlink -f "$candidate")
  if [[ "$candidate_real" == "$current_real" || "$candidate_real" == "$previous_real" ]]; then
    continue
  fi
  kept=$((kept + 1))
  if (( kept > 5 )); then
    rm -rf -- "$candidate_real"
  fi
done

echo "Activated release $commit_sha"
echo "Database changed: $database_changed"
echo "Rollback allowed from this release: $rollback_allowed"
