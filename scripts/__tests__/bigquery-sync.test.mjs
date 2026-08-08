import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableManifest, validateTableManifest } from '../analytics/table-manifest.mjs';
import { bigQuerySchema, commitRunSql, createDestinationSql, exportSql, mergeSql, pipelineBootstrapSql, replaceSql } from '../analytics/bigquery-sql.mjs';

test('manifest has unique safe destinations and valid watermarks', () => {
  const validated = validateTableManifest();
  assert.equal(validated.length, tableManifest.length);
  assert.ok(validated.length >= 15);
  assert.ok(validated.every((table) => table.primaryKey.length > 0));
});

test('manifest intentionally excludes sensitive operational payload tables and raw payload columns', () => {
  const destinations = new Set(tableManifest.map((table) => table.destinationTable));
  for (const excluded of ['raw_scrape_logs','feedback','feedback_attachments','cache_entries']) assert.equal(destinations.has(excluded), false);
  for (const table of tableManifest) {
    const columns = new Set(table.columns.map((column) => column.name));
    assert.equal(columns.has('raw_payload'), false, `${table.destinationTable} exports raw_payload`);
    assert.equal(columns.has('round_raw'), false, `${table.destinationTable} exports round_raw`);
  }
});

test('incremental export uses overlap and tuple high watermark', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const sql = exportSql(table, { lowerWatermark: '2026-08-08T04:00:00.000000Z', highWatermark: { timestamp: '2026-08-08T05:00:00.000000Z', tieBreaker: '11111111-1111-1111-1111-111111111111' } });
  assert.match(sql, /updated_at.*INTERVAL '3600 seconds'/s);
  assert.match(sql, /\("updated_at", "id"\) <=/);
  assert.match(sql, /ORDER BY "updated_at", "id"/);
  assert.doesNotMatch(sql, /raw_payload/);
});

test('BigQuery schema is explicit and preserves required/nullable modes', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'fixtures');
  const schema = bigQuerySchema(table);
  assert.deepEqual(schema.find((field) => field.name === 'id'), { name: 'id', type: 'STRING', mode: 'REQUIRED' });
  assert.deepEqual(schema.find((field) => field.name === 'date_played'), { name: 'date_played', type: 'DATE', mode: 'NULLABLE' });
});

test('partitioned destination DDL and replacement retain physical design', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const create = createDestinationSql({ project: 'proj', rawDataset: 'raw', table });
  const replace = replaceSql({ project: 'proj', rawDataset: 'raw', stagingTable: '_stage_rubbers_x', table });
  assert.match(create, /PARTITION BY DATE\(played_at\)/);
  assert.match(create, /CLUSTER BY fixture_id, home_player_1_id, away_player_1_id/);
  assert.match(replace, /CREATE OR REPLACE TABLE/);
  assert.match(replace, /PARTITION BY DATE\(played_at\)/);
});

test('MERGE deduplicates staging rows and updates by primary key without unsafe partition filtering', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const sql = mergeSql({ project: 'proj', rawDataset: 'raw', stagingTable: '_stage_rubbers_x', table });
  assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY id ORDER BY updated_at DESC, id DESC\)/);
  assert.match(sql, /ON T\.id = S\.id/);
  assert.match(sql, /WHEN MATCHED THEN UPDATE SET/);
  assert.match(sql, /WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(sql, /T\.played_at BETWEEN/);
});

test('pipeline bootstrap and commit advance watermark only in success transaction', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'external_players');
  const bootstrap = pipelineBootstrapSql({ project: 'proj', pipelineDataset: 'pipeline' });
  const commit = commitRunSql({ project: 'proj', pipelineDataset: 'pipeline', table, runId: 'run-1', startedAt: '2026-08-08T05:00:00.000Z', sourceRows: 10, highWatermark: { timestamp: '2026-08-08T05:00:00.000000Z', tieBreaker: '11111111-1111-1111-1111-111111111111' }, mode: 'incremental-merge' });
  assert.match(bootstrap, /sync_watermarks/);
  assert.match(bootstrap, /sync_runs/);
  assert.match(commit, /BEGIN TRANSACTION;/);
  assert.match(commit, /MERGE `proj\.pipeline\.sync_watermarks`/);
  assert.match(commit, /status\).*'succeeded'/s);
  assert.match(commit, /COMMIT TRANSACTION;/);
});

test('manifest validator rejects duplicate destinations and broken watermarks', () => {
  const good = tableManifest[0];
  assert.throws(() => validateTableManifest([good, { ...good }]), /Duplicate destination/);
  const incremental = tableManifest.find((entry) => entry.mode === 'incremental-merge');
  assert.throws(() => validateTableManifest([{ ...incremental, watermark: { ...incremental.watermark, column: 'missing' } }]), /Invalid watermark/);
});
