import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backupScript = path.join(repositoryRoot, 'scripts', 'backup-vps-postgres.sh');
const verifyScript = path.join(repositoryRoot, 'scripts', 'verify-vps-postgres-backup.sh');
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

async function runVerifyScenario({
  metadataOverrides = {},
  checksumOverride = null,
  catalogStatus = 0,
  restoreStatus = 0,
  missingTable = '',
  emptyTable = '',
  restoreTest = true,
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ttp-db-verify-test-'));
  temporaryDirectories.push(directory);
  const remoteDirectory = path.join(directory, 'remote');
  await mkdir(remoteDirectory);
  const runId = 'run-123';
  const runPrefix = `gs://test-backup-bucket/backups/postgres/${runId}`;
  const dump = Buffer.from('fake-custom-archive');
  const checksum = createHash('sha256').update(dump).digest('hex');
  await writeFile(path.join(remoteDirectory, 'database.dump'), dump);
  await writeFile(path.join(remoteDirectory, 'database.sha256'), `${checksumOverride ?? checksum}\n`);
  await writeFile(path.join(remoteDirectory, 'metadata.json'), `${JSON.stringify({
    schemaVersion: 1,
    status: 'succeeded',
    createdAt: '2026-08-08T08:00:00Z',
    runId,
    database: 'tt_players',
    databaseBytes: 123456,
    dumpBytes: dump.length,
    releaseSha: 'deadbeef1234567890',
    sha256: checksum,
    postgresVersion: 'pg_dump (PostgreSQL) 18.1',
    ...metadataOverrides,
  })}\n`);

  const createLog = path.join(directory, 'createdb.log');
  const dropLog = path.join(directory, 'dropdb.log');
  const psqlLog = path.join(directory, 'psql.log');

  const gcloud = await createExecutable(directory, 'gcloud', `
[[ "\${1:-}" == "storage" && "\${2:-}" == "cp" ]]
cp "$REMOTE_BACKUP_DIR/$(basename "$3")" "$4"
`);
  const pgRestore = await createExecutable(directory, 'pg_restore', `
if [[ "\${1:-}" == "--list" ]]; then exit ${catalogStatus}; fi
exit ${restoreStatus}
`);
  const createdb = await createExecutable(directory, 'createdb', `
printf '%s\n' "$*" >> "$CREATE_LOG"
`);
  const dropdb = await createExecutable(directory, 'dropdb', `
printf '%s\n' "$*" >> "$DROP_LOG"
`);
  const psql = await createExecutable(directory, 'psql', `
printf '%s\n' "$*" >> "$PSQL_LOG"
if [[ "$*" == *"to_regclass("* ]]; then
  if [[ -n "$MISSING_TABLE" && "$*" == *"$MISSING_TABLE"* ]]; then echo f; else echo t; fi
  exit 0
fi
if [[ "$*" == *"SELECT count(*) FROM"* ]]; then
  if [[ -n "$EMPTY_TABLE" && "$*" == *"\"$EMPTY_TABLE\""* ]]; then echo 0; else echo 42; fi
  exit 0
fi
echo "unexpected psql query: $*" >&2
exit 70
`);

  const args = [verifyScript, runPrefix];
  if (restoreTest) args.push('--restore-test');
  const result = spawnSync('bash', args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TTP_VERIFY_SKIP_SUDO: '1',
      TMPDIR: directory,
      GCLOUD_BIN: gcloud,
      PG_RESTORE_BIN: pgRestore,
      CREATEDB_BIN: createdb,
      DROPDB_BIN: dropdb,
      PSQL_BIN: psql,
      REMOTE_BACKUP_DIR: remoteDirectory,
      CREATE_LOG: createLog,
      DROP_LOG: dropLog,
      PSQL_LOG: psqlLog,
      MISSING_TABLE: missingTable,
      EMPTY_TABLE: emptyTable,
    },
    encoding: 'utf8',
  });

  const created = (await readFile(createLog, 'utf8').catch(() => '')).trim();
  const dropped = (await readFile(dropLog, 'utf8').catch(() => '')).trim();
  const psqlQueries = (await readFile(psqlLog, 'utf8').catch(() => '')).trim();
  const leftovers = (await readdir(directory)).filter((entry) => entry.startsWith('ttp-db-verify.'));
  return { result, created, dropped, psqlQueries, leftovers };
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

test('verifier rejects inconsistent success metadata before restore', async () => {
  const { result, created, leftovers } = await runVerifyScenario({
    metadataOverrides: { sha256: 'not-the-dump-checksum' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /metadata SHA-256 does not match database\.dump/);
  assert.equal(created, '');
  assert.deepEqual(leftovers, []);
});

test('restore drill validates critical tables and always drops its generated database', async () => {
  const { result, created, dropped, psqlQueries, leftovers } = await runVerifyScenario();

  assert.equal(result.status, 0, result.stderr);
  assert.match(created, /^tt_players_restore_\d{14}_\d+$/);
  assert.equal(dropped, `--if-exists ${created}`);
  assert.match(psqlQueries, /public\.kysely_migration/);
  assert.match(psqlQueries, /public\.rubbers/);
  assert.match(psqlQueries, /staging\.ranking_entries/);
  assert.match(result.stdout, /Restore drill succeeded/);
  assert.deepEqual(leftovers, []);
});

test('restore drill fails when a required table is missing and still drops the database', async () => {
  const { result, created, dropped, leftovers } = await runVerifyScenario({ missingTable: 'public.rubbers' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /required table public\.rubbers is missing/);
  assert.equal(dropped, `--if-exists ${created}`);
  assert.deepEqual(leftovers, []);
});

test('restore drill fails when a critical table is empty and still drops the database', async () => {
  const { result, created, dropped, leftovers } = await runVerifyScenario({ emptyTable: 'rubbers' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /required table public\.rubbers has no rows/);
  assert.equal(dropped, `--if-exists ${created}`);
  assert.deepEqual(leftovers, []);
});

test('verifier rejects a checksum mismatch before catalog or restore', async () => {
  const { result, created, leftovers } = await runVerifyScenario({ checksumOverride: 'bad-checksum' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Backup checksum mismatch/);
  assert.equal(created, '');
  assert.deepEqual(leftovers, []);
});
