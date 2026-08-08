#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { run } from './commands.mjs';
import { validateTableManifest } from './table-manifest.mjs';
import { bigQuerySchema, bqIdentifier, commitRunSql, createDestinationSql, exportSql, failureRunSql, highWatermarkSql, mergeSql, pipelineBootstrapSql, readWatermarkSql, replaceEmptySql, replaceSql, resetWatermarkSql, stageValidationSql, validationResultSql } from './bigquery-sql.mjs';

const args = new Set(process.argv.slice(2));
const fullRefresh = args.has('--full-refresh');
const only = process.argv.find((value) => value.startsWith('--table='))?.split('=', 2)[1] ?? null;

const config = {
  project: process.env.TTP_GCP_PROJECT ?? '', bucket: process.env.TTP_GCS_BUCKET ?? '',
  location: process.env.TTP_BQ_LOCATION ?? 'us-central1', rawDataset: process.env.TTP_BQ_RAW_DATASET ?? 'tt_players_raw',
  pipelineDataset: process.env.TTP_BQ_PIPELINE_DATASET ?? 'tt_players_pipeline', loadPrefix: process.env.TTP_GCS_WAREHOUSE_PREFIX ?? 'warehouse-loads',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql:///tt_players?host=/var/run/postgresql', maxBytesBilled: process.env.TTP_BQ_MAX_BYTES_BILLED ?? '20000000000',
  psql: process.env.PSQL_BIN ?? 'psql', sudo: process.env.SUDO_BIN ?? 'sudo', gcloud: process.env.GCLOUD_BIN ?? 'gcloud', bq: process.env.BQ_BIN ?? 'bq', curl: process.env.CURL_BIN ?? 'curl',
};

for (const [key, value] of Object.entries({ project: config.project, bucket: config.bucket })) if (!value) throw new Error(`Missing required configuration: ${key}`);
if (!/^\d+$/.test(config.maxBytesBilled)) throw new Error('TTP_BQ_MAX_BYTES_BILLED must be an integer');
const manifest = validateTableManifest().filter((table) => !only || table.destinationTable === only);
if (only && manifest.length !== 1) throw new Error(`Unknown table: ${only}`);

function bqQuery(sql, { json = false } = {}) {
  const commandArgs = ['query', `--project_id=${config.project}`, `--location=${config.location}`, '--use_legacy_sql=false', `--maximum_bytes_billed=${config.maxBytesBilled}`, '--quiet'];
  if (json) commandArgs.push('--format=json');
  commandArgs.push(sql);
  return run(config.bq, commandArgs);
}
function psqlArgs(sql) { return ['-u','postgres','--',config.psql,config.databaseUrl,'-X','-q','-A','-t','--no-psqlrc','--set=ON_ERROR_STOP=1','--command',sql]; }
function psqlScalar(sql) { return run(config.sudo, psqlArgs(sql)).stdout.trim(); }
function loadStage({ stagingTable, gcsUri, schemaPath }) {
  run(config.bq, ['load',`--project_id=${config.project}`,`--location=${config.location}`,'--source_format=NEWLINE_DELIMITED_JSON','--replace','--quiet',`${config.rawDataset}.${stagingTable}`,gcsUri,schemaPath]);
  run(config.bq, ['update',`--project_id=${config.project}`,`--location=${config.location}`,'--expiration=86400','--quiet',`${config.rawDataset}.${stagingTable}`]);
}
function gcsObjectName(gcsUri) {
  const bucketPrefix = `gs://${config.bucket}/`;
  if (!gcsUri.startsWith(bucketPrefix)) throw new Error(`GCS URI is outside configured bucket: ${gcsUri}`);
  return gcsUri.slice(bucketPrefix.length);
}
function gcsApiUrl(gcsUri) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.bucket)}/o/${encodeURIComponent(gcsObjectName(gcsUri))}`;
}
function gcsUploadUrl(gcsUri) {
  return `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(config.bucket)}/o?uploadType=media&name=${encodeURIComponent(gcsObjectName(gcsUri))}`;
}
function gcsResumableUploadUrl(gcsUri) {
  return gcsUploadUrl(gcsUri).replace('uploadType=media', 'uploadType=resumable');
}
function gcsAccessToken() {
  const token = run(config.gcloud, ['auth', 'print-access-token', '--quiet']).stdout.trim();
  if (!token) throw new Error('gcloud auth print-access-token returned no token');
  return token;
}
function gcsAuthHeader(token) {
  return `Authorization: Bearer ${token}\n`;
}
function waitForProcess(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, label }));
  });
}
function appendStderr(current, chunk) {
  const next = current + chunk;
  return next.length > 1024 * 1024 ? next.slice(-1024 * 1024) : next;
}
const GCS_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
async function createGcsResumableSession(gcsUri, tempRoot, tableName) {
  const token = gcsAccessToken();
  const requestHeadersPath = path.join(tempRoot, `${tableName}.resumable-headers`);
  const uploadHeadersPath = path.join(tempRoot, `${tableName}.upload-headers`);
  const responseHeadersPath = path.join(tempRoot, `${tableName}.resumable-response-headers`);
  await writeFile(requestHeadersPath, `${gcsAuthHeader(token)}Content-Type: application/json; charset=UTF-8\nX-Upload-Content-Type: application/octet-stream\n`, { mode: 0o600 });
  await writeFile(uploadHeadersPath, `${gcsAuthHeader(token)}Content-Type: application/octet-stream\n`, { mode: 0o600 });
  run(config.curl, [
    '--fail', '--silent', '--show-error', '--location', '--request', 'POST', '--header', `@${requestHeadersPath}`,
    '--data', '{}', '--dump-header', responseHeadersPath, '--output', '/dev/null', gcsResumableUploadUrl(gcsUri),
  ]);
  const responseHeaders = await readFile(responseHeadersPath, 'utf8');
  const location = responseHeaders.match(/^location:\s*(\S+)\s*$/im)?.[1];
  if (!location) throw new Error(`Cloud Storage did not return a resumable upload location for ${tableName}`);
  return { location, uploadHeadersPath };
}
async function psqlExportToGcs(sql, gcsUri, tempRoot, tableName) {
  const { location, uploadHeadersPath } = await createGcsResumableSession(gcsUri, tempRoot, tableName);
  const exporter = spawn(config.sudo, psqlArgs(sql), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let rows = 0;
  let exportStderr = '';
  exporter.stderr.setEncoding('utf8');
  exporter.stderr.on('data', (chunk) => { exportStderr = appendStderr(exportStderr, chunk); });
  exporter.stdout.on('error', () => {});
  const exportResultPromise = waitForProcess(exporter, 'PostgreSQL export');
  let uploadedBytes = 0;
  let buffered = Buffer.alloc(0);
  async function uploadChunk(chunk, total) {
    const start = uploadedBytes;
    const end = start + chunk.length - 1;
    const uploader = spawn(config.curl, [
      '--fail', '--silent', '--show-error', '--location', '--request', 'PUT', '--header', `@${uploadHeadersPath}`,
      '--header', `Content-Length: ${chunk.length}`, '--header', `Content-Range: bytes ${start}-${end}/${total ?? '*'}`,
      '--upload-file', '-', location,
    ], { env: process.env, stdio: ['pipe', 'ignore', 'pipe'] });
    let uploadStderr = '';
    uploader.stderr.setEncoding('utf8');
    uploader.stderr.on('data', (chunkData) => { uploadStderr = appendStderr(uploadStderr, chunkData); });
    uploader.stdin.on('error', () => {});
    uploader.stdin.end(chunk);
    const uploadResult = await waitForProcess(uploader, 'Cloud Storage upload');
    if (uploadResult.status !== 0) throw new Error(`Cloud Storage upload failed (${uploadResult.status}): ${uploadStderr}`.trim());
    uploadedBytes += chunk.length;
  }
  try {
    for await (const outputChunk of exporter.stdout) {
      for (const byte of outputChunk) if (byte === 10) rows += 1;
      buffered = buffered.length === 0 ? outputChunk : Buffer.concat([buffered, outputChunk]);
      while (buffered.length > GCS_UPLOAD_CHUNK_BYTES) {
        const chunk = buffered.subarray(0, GCS_UPLOAD_CHUNK_BYTES);
        buffered = buffered.subarray(GCS_UPLOAD_CHUNK_BYTES);
        await uploadChunk(chunk, null);
      }
    }
    if (buffered.length > 0) await uploadChunk(buffered, uploadedBytes + buffered.length);
  } catch (error) {
    exporter.kill('SIGTERM');
    await exportResultPromise.catch(() => {});
    throw error;
  }
  const exportResult = await exportResultPromise;
  if (exportResult.status !== 0) throw new Error(`PostgreSQL export failed (${exportResult.status}): ${exportStderr}`.trim());
  return { rows };
}
function deleteGcsObject(gcsUri) {
  try {
    const token = gcsAccessToken();
    return run(config.curl, [
      '--fail', '--silent', '--show-error', '--location', '--request', 'DELETE', '--header', '@-', gcsApiUrl(gcsUri),
    ], { input: gcsAuthHeader(token), allowFailure: true });
  } catch (error) {
    return { status: 1, error };
  }
}
function validateStage(table, stagingTable, expectedRows, runId) {
  const [row] = JSON.parse(bqQuery(stageValidationSql({ project: config.project, rawDataset: config.rawDataset, stagingTable, table }), { json: true }).stdout || '[]');
  if (!row) throw new Error(`No validation result for ${table.destinationTable}`);
  const actualRows = Number(row.row_count), nullKeys = Number(row.null_key_count), duplicateKeys = Number(row.duplicate_key_count);
  const failure = actualRows !== expectedRows
    ? `${table.destinationTable} row-count mismatch: source=${expectedRows}, staged=${actualRows}`
    : nullKeys !== 0 || duplicateKeys !== 0
      ? `${table.destinationTable} key validation failed: null=${nullKeys}, duplicates=${duplicateKeys}`
      : null;
  bqQuery(validationResultSql({
    project: config.project,
    pipelineDataset: config.pipelineDataset,
    runId,
    table,
    sourceRows: expectedRows,
    stagedRows: actualRows,
    nullKeyCount: nullKeys,
    duplicateKeyCount: duplicateKeys,
    status: failure ? 'failed' : 'passed',
  }));
  if (failure) throw new Error(failure);
}
function parseWatermark(stdout) { const rows = JSON.parse(stdout || '[]'); return !rows.length || !rows[0].watermark ? null : { timestamp: rows[0].watermark, tieBreaker: rows[0].tie_breaker }; }
function sourceHighWatermark(table) { const value = psqlScalar(highWatermarkSql(table)); if (!value) return null; const [timestamp,tieBreaker] = value.split('\t'); if (!timestamp || !tieBreaker) throw new Error(`Invalid source watermark for ${table.destinationTable}`); return { timestamp,tieBreaker }; }

async function syncTable(table, tempRoot) {
  const startedAt = new Date().toISOString();
  const runToken = randomUUID().replaceAll('-', '');
  const runId = `${startedAt.replaceAll(/[-:.TZ]/g, '')}-${runToken}-${table.destinationTable}`;
  const stageTable = `_stage_${table.destinationTable}_${runToken}`;
  const schemaPath = path.join(tempRoot, `${table.destinationTable}.schema.json`);
  const gcsUri = `gs://${config.bucket}/${config.loadPrefix.replace(/\/+$/, '')}/${runId}/${table.destinationTable}.ndjson`;
  let prior = null, high = null;
  const effectiveMode = fullRefresh ? 'full-replace' : table.mode;
  let remoteCreated = false;
  let rows = 0;
  try {
    if (table.mode === 'incremental-merge' && !fullRefresh) {
      prior = parseWatermark(bqQuery(readWatermarkSql({ project: config.project, pipelineDataset: config.pipelineDataset, tableName: table.destinationTable }), { json: true }).stdout);
      high = sourceHighWatermark(table);
      if (!high) { console.log(`[${table.destinationTable}] no source rows; skipped`); return; }
    } else if (table.watermark) high = sourceHighWatermark(table);

    await writeFile(schemaPath, `${JSON.stringify(bigQuerySchema(table), null, 2)}\n`, { mode: 0o600 });
    remoteCreated = true;
    ({ rows } = await psqlExportToGcs(exportSql(table, {
      lowerWatermark: prior?.timestamp ?? null,
      highWatermark: effectiveMode === 'incremental-merge' ? high : null,
      includeOrder: !fullRefresh,
    }), gcsUri, tempRoot, table.destinationTable));
    if (rows === 0 && effectiveMode === 'incremental-merge') { console.log(`[${table.destinationTable}] no changed rows; watermark remains ${prior?.timestamp ?? 'unset'}`); return; }
    if (rows === 0 && effectiveMode === 'full-replace') {
      bqQuery(replaceEmptySql({ project: config.project, rawDataset: config.rawDataset, table }));
      if (table.watermark && !high) bqQuery(resetWatermarkSql({ project: config.project, pipelineDataset: config.pipelineDataset, tableName: table.destinationTable }));
      bqQuery(commitRunSql({ project: config.project, pipelineDataset: config.pipelineDataset, table, runId, startedAt, sourceRows: 0, highWatermark: high, mode: effectiveMode }));
      console.log(`[${table.destinationTable}] replaced with an empty table`); return;
    }

    console.log(`[${table.destinationTable}] exporting ${rows} rows`);
    loadStage({ stagingTable: stageTable, gcsUri, schemaPath }); validateStage(table, stageTable, rows, runId);
    if (effectiveMode === 'full-replace') bqQuery(replaceSql({ project: config.project, rawDataset: config.rawDataset, stagingTable: stageTable, table }));
    else { bqQuery(createDestinationSql({ project: config.project, rawDataset: config.rawDataset, table })); bqQuery(mergeSql({ project: config.project, rawDataset: config.rawDataset, stagingTable: stageTable, table })); }
    bqQuery(commitRunSql({ project: config.project, pipelineDataset: config.pipelineDataset, table, runId, startedAt, sourceRows: rows, highWatermark: high, mode: effectiveMode }));
  } catch (error) {
    try { bqQuery(failureRunSql({ project: config.project, pipelineDataset: config.pipelineDataset, table, runId, startedAt, sourceRows: rows, mode: effectiveMode })); } catch {}
    throw error;
  } finally {
    try { bqQuery(`DROP TABLE IF EXISTS ${bqIdentifier(config.project, config.rawDataset, stageTable)};`); } catch { console.warn(`[${table.destinationTable}] staging table cleanup deferred to its 24h expiration`); }
    if (remoteCreated) { const cleanup = deleteGcsObject(gcsUri); if (cleanup.status !== 0) console.warn(`[${table.destinationTable}] GCS cleanup deferred to bucket lifecycle`); }
  }
  console.log(`[${table.destinationTable}] sync succeeded`);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ttp-bigquery-sync-'));
try {
  bqQuery(pipelineBootstrapSql({ project: config.project, pipelineDataset: config.pipelineDataset }));
  for (const table of manifest) await syncTable(table, tempRoot);
  console.log(`BigQuery ${fullRefresh ? 'full refresh' : 'incremental sync'} completed`);
} finally { await rm(tempRoot, { recursive: true, force: true }); }
