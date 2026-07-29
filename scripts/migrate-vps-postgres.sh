#!/usr/bin/env bash
# ============================================================================
# Apply database migrations to the VPS PostgreSQL instance.
#
# Kysely migrations are applied as the PostgreSQL superuser (the application
# role ttp_app is DML-only and cannot run DDL). The migrator is run with `bun`
# (not pnpm) because it is executed as the `postgres` OS user, which has only
# read access to /opt/tt-players; bun runs the TypeScript directly without
# writing temp files into the project directory. VPS-specific application role
# grants are applied afterwards.
#
# Usage (run as the postgres OS user):
#   DATABASE_URL=postgresql:///tt_players ./scripts/migrate-vps-postgres.sh
# ============================================================================
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the VPS PostgreSQL connection string.}"

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
bun_bin="${BUN_BIN:-/usr/local/bin/bun}"
psql_cmd=(psql "$DATABASE_URL" --set=ON_ERROR_STOP=1)

# 1. Run pending Kysely migrations (@tt-players/db).
DATABASE_URL="$DATABASE_URL" "$bun_bin" "$root_dir/packages/db/src/migrate.ts"

# 2. Grant privileges to the restricted application role (VPS-specific).
"${psql_cmd[@]}" --file "$root_dir/infra/postgres/9999_application_grants.sql"