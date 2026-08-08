import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(repositoryRoot, 'scripts', 'analytics', 'sync-bigquery.mjs');
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function executable(directory, name, body) {
  const file = path.join(directory, name);
  await writeFile(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  await chmod(file, 0o755);
  return file;
}

async function runScenario({ invalidStage = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ttp-bigquery-runtime-test-'));
  temporaryDirectories.push(directory);
  const remoteDirectory = path.join(directory, 'remote');
  const commandLog = path.join(directory, 'commands.log');
  await writeFile(commandLog, '');

  const sudo = await executable(directory, 'sudo', `
if [[ "\${1:-}" == "-u" ]]; then shift 2; fi
if [[ "\${1:-}" == "--" ]]; then shift; fi
exec "$@"
`);
  const psql = await executable(directory, 'psql', `
printf '%s\n' '{"id":"11111111-1111-1111-1111-111111111111","name":"Platform","base_url":"https://example.test","created_at":"2026-08-08T05:00:00.000000Z"}'
`);
  const gcloud = await executable(directory, 'gcloud', `
printf 'gcloud %s\n' "$*" >> "$COMMAND_LOG"
if [[ "\${1:-}" == "storage" && "\${2:-}" == "cp" ]]; then
  mkdir -p "$REMOTE_DIRECTORY"
  cp "$3" "$REMOTE_DIRECTORY/$(basename "$4")"
elif [[ "\${1:-}" == "storage" && "\${2:-}" == "rm" ]]; then
  rm -f "$REMOTE_DIRECTORY/$(basename "$3")"
fi
`);
  const bq = await executable(directory, 'bq', `
printf 'bq %s\n' "$*" >> "$COMMAND_LOG"
if [[ "\${1:-}" == "query" ]]; then
  sql="\${!#}"
  if [[ "$sql" == *"COUNT(*) AS row_count"* ]]; then
    if [[ "\${INVALID_STAGE:-0}" == "1" ]]; then
      printf '[{"row_count":"1","null_key_count":"0","duplicate_key_count":"1"}]'
    else
      printf '[{"row_count":"1","null_key_count":"0","duplicate_key_count":"0"}]'
    fi
  fi
fi
`);

  const result = spawnSync(process.execPath, [runner, '--full-refresh', '--table=platforms'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TTP_GCP_PROJECT: 'test-project',
      TTP_GCS_BUCKET: 'test-bucket',
      TTP_BQ_LOCATION: 'us-central1',
      TTP_BQ_RAW_DATASET: 'tt_players_raw',
      TTP_BQ_PIPELINE_DATASET: 'tt_players_pipeline',
      TTP_GCS_WAREHOUSE_PREFIX: 'warehouse-loads',
      TTP_BQ_MAX_BYTES_BILLED: '5000000000',
      SUDO_BIN: sudo,
      PSQL_BIN: psql,
      GCLOUD_BIN: gcloud,
      BQ_BIN: bq,
      COMMAND_LOG: commandLog,
      REMOTE_DIRECTORY: remoteDirectory,
      INVALID_STAGE: invalidStage ? '1' : '0',
      TMPDIR: directory,
    },
    encoding: 'utf8',
  });

  return { result, commands: await readFile(commandLog, 'utf8') };
}

test('runtime moves a run-scoped object from GCS into BigQuery before publication and cleanup', async () => {
  const { result, commands } = await runScenario();

  assert.equal(result.status, 0, result.stderr);
  assert.match(commands, /gcloud storage cp .*gs:\/\/test-bucket\/warehouse-loads\/.*\/platforms\.ndjson/);
  assert.match(commands, /bq load .*gs:\/\/test-bucket\/warehouse-loads\/.*\/platforms\.ndjson/);
  assert.match(commands, /CREATE OR REPLACE TABLE `test-project\.tt_players_raw\.platforms`/s);
  assert.match(commands, /INSERT INTO `test-project\.tt_players_pipeline\.validation_results`/s);
  assert.match(commands, /gcloud storage rm .*gs:\/\/test-bucket\/warehouse-loads\/.*\/platforms\.ndjson/);
});

test('runtime refuses to publish a staging table that fails key validation', async () => {
  const { result, commands } = await runScenario({ invalidStage: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /key validation failed/);
  assert.match(commands, /validation_results/);
  assert.doesNotMatch(commands, /CREATE OR REPLACE TABLE `test-project\.tt_players_raw\.platforms`/s);
});
