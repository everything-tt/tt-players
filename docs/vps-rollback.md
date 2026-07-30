# VPS release and rollback runbook

TT Players deploys the API and Graphile worker as immutable, commit-addressed
releases under `/opt/tt-players/releases`. The active release is selected through
`/opt/tt-players/current`; systemd always starts both services through that
symlink.

```text
/opt/tt-players/
├── current -> releases/<active-commit>
├── previous -> releases/<previous-compatible-commit>
└── releases/
    ├── <commit-a>/
    └── <commit-b>/
```

## Deployment behaviour

The `Deploy API and Database to VPS` workflow:

1. builds and tests the repository;
2. compares the currently deployed commit with the new commit;
3. calculates a fingerprint over `packages/db`, `infra/postgres`, and
   `scripts/migrate-vps-postgres.sh`;
4. uploads the source into `/opt/tt-players/releases/<commit>`;
5. installs dependencies and records `.release-metadata`;
6. applies migrations only when database-controlled files changed;
7. atomically switches `current`, restarts both services, and runs health checks.

The first versioned deployment is deliberately treated as a database boundary
because the legacy deployment has no release metadata.

## Database boundary rule

Database migrations are forward-only. A release that changes database-controlled
files is written with:

```text
database_changed=true
rollback_allowed=false
```

For such a release:

- API and worker are stopped before migration;
- the old `previous` pointer is removed;
- no rollback to the pre-migration code is permitted;
- recovery must be a newer forward deployment.

A later code-only release receives the same database fingerprint and may be rolled
back to another successfully deployed release with that exact fingerprint. This
allows safe application rollback without crossing a schema boundary.

## Manual rollback workflow

Run **Actions → Roll back VPS release → Run workflow** and provide either:

- `previous`; or
- an already deployed commit SHA or unique SHA prefix.

The workflow is intentionally manual and shares the same concurrency group as
production deployment, so deploy and rollback cannot run simultaneously.

Before switching services, `scripts/rollback-vps-release.sh` verifies:

1. the current release allows rollback;
2. the target exists under `/opt/tt-players/releases`;
3. the target previously passed deployment health checks;
4. current and target database fingerprints are identical.

If the selected target fails its service or API health check, the script restores
the release that was active before the rollback attempt.

## Inspect release state on the VPS

```bash
readlink -f /opt/tt-players/current
cat /opt/tt-players/current/.release-metadata

if [ -L /opt/tt-players/previous ]; then
  readlink -f /opt/tt-players/previous
  cat /opt/tt-players/previous/.release-metadata
fi

find /opt/tt-players/releases -maxdepth 2 \
  -name .release-metadata -print -exec cat {} \;
```

## Important operational rule

Do not manually repoint `current` to bypass the database fingerprint check. When a
migration release is unhealthy, fix it with a newer release and deploy forward.
Database restore is a separate emergency procedure and is not performed by the
rollback workflow.
