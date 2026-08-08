import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backupScript = path.join(repositoryRoot, 'scripts', 'backup-vps-postgres.sh');
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function createExecutable(directory, name, body) {
  const executable = path.join(directory, name);
  await writeFile(executable, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  await chmod(executable, 0o755);
  return executable;
}

async function runScenario({ dumpStatus = 0, restoreStatus = 0, uploadFailureAt = 0 } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ttp-db-backup-test-'));
  temporaryDirectories.push(directory);
  const uploadLog = path.join(directory, 'uploads.log');
  const releaseMetadata = path.join(directory, 'release-metadata');
  await writeFile(releaseMetadata, 'commit_sha=deadbeef1234567890\n');

  const pgDump = await createExecutable(directory, 'pg_dump', `
if [[ "\${1:-}" == "--version" ]]; then
  echo "pg_dump (PostgreSQL) 18.1"
  exit 0
fi
if [[ ${dumpStatus} -ne 0 ]]; then exit ${dumpStatus}; fi
printf 'fake-custom-archive'
`);

  const pgRestore = await createExecutable(directory, 'pg_restore', `
exit ${restoreStatus}
`);

  const psql = await createExecutable(directory, 'psql', `
echo 123456
`);

  const gcloud = await createExecutable(directory, 'gcloud', `
count=0
if [[ -f "$UPLOAD_LOG" ]]; then count=$(wc -l < "$UPLOAD_LOG"); fi
count=$((count + 1))
printf '%s\n' "$*" >> "$UPLOAD_LOG"
if [[ "$FAIL_UPLOAD_AT" -gt 0 && "$count" -eq "$FAIL_UPLOAD_AT" ]]; then
  exit 61
fi
`);

  const result = spawnSync('bash', [backupScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TTP_GCS_BUCKET: 'test-backup-bucket',
      TTP_BACKUP_SKIP_SUDO: '1',
      TTP_GCLOUD_SKIP_AUTH: '1',
      TTP_BACKUP_LOCK_FILE: path.join(directory, 'backup.lock'),
      TTP_RELEASE_METADATA_FILE: releaseMetadata,
      TMPDIR: directory,
      PG_DUMP_BIN: pgDump,
      PG_RESTORE_BIN: pgRestore,
      PSQL_BIN: psql,
      GCLOUD_BIN: gcloud,
      UPLOAD_LOG: uploadLog,
      FAIL_UPLOAD_AT: String(uploadFailureAt),
    },
    encoding: 'utf8',
  });

  const uploads = (await readFile(uploadLog, 'utf8').catch(() => ''))
    .trim()
    .split('\n')
    .filter(Boolean);
  const leftovers = (await readdir(directory)).filter((entry) => entry.startsWith('ttp-db-backup.'));

  return { result, uploads, leftovers };
}

test('uploads dump, checksum, then metadata success marker', async () => {
  const { result, uploads, leftovers } = await runScenario();

  assert.equal(result.status, 0, result.stderr);
  assert.equal(uploads.length, 3);
  assert.match(uploads[0], /database\.dump .*\/database\.dump --quiet$/);
  assert.match(uploads[1], /database\.sha256 .*\/database\.sha256 --quiet$/);
  assert.match(uploads[2], /metadata\.json .*\/metadata\.json --quiet$/);
  assert.deepEqual(leftovers, []);
});

test('does not upload anything after pg_dump failure', async () => {
  const { result, uploads, leftovers } = await runScenario({ dumpStatus: 42 });

  assert.equal(result.status, 42);
  assert.deepEqual(uploads, []);
  assert.deepEqual(leftovers, []);
});

test('does not upload anything after pg_restore catalog validation failure', async () => {
  const { result, uploads, leftovers } = await runScenario({ restoreStatus: 43 });

  assert.equal(result.status, 43);
  assert.deepEqual(uploads, []);
  assert.deepEqual(leftovers, []);
});

test('fails the run if any upload fails and never publishes metadata early', async () => {
  const { result, uploads, leftovers } = await runScenario({ uploadFailureAt: 2 });

  assert.equal(result.status, 61);
  assert.equal(uploads.length, 2);
  assert.doesNotMatch(uploads.join('\n'), /metadata\.json/);
  assert.deepEqual(leftovers, []);
});
