import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableManifest, validateTableManifest } from '../analytics/table-manifest.mjs';
import {
  bigQuerySchema,
  commitRunSql,
  createDestinationSql,
  exportSql,
  mergeSql,
  pipelineBootstrapSql,
  replaceSql,
  stageValidationSql,
  validationResultSql,
} from '../analytics/bigquery-sql.mjs';

test('manifest has unique safe destinations and valid watermarks', () => {
  const validated = validateTableManifest();
  assert.equal(validated.length, tableManifest.length);
  assert.ok(validated.length >= 24);
  assert.ok(validated.every((table) => table.primaryKey.length > 0));
});

test('manifest mirrors scraper source data while excluding sensitive user content', () => {
  const destinations = new Set(tableManifest.map((table) => table.destinationTable));
  assert.equal(destinations.has('raw_scrape_logs'), true);
  assert.equal(destinations.has('feedback'), false);
  assert.equal(destinations.has('feedback_attachments'), false);
  assert.equal(destinations.has('cache_entries'), false);

  const rawLog = tableManifest.find((table) => table.destinationTable === 'raw_scrape_logs');
  assert.ok(rawLog.columns.some((column) => column.name === 'raw_payload'));
  assert.equal(rawLog.watermark.column, 'updated_at');

  const sourceEvents = tableManifest.find((table) => table.destinationTable === 'source_events');
  assert.ok(sourceEvents.columns.some((column) => column.name === 'raw_payload'));

  const resultRows = tableManifest.find((table) => table.destinationTable === 'source_event_result_rows');
  for (const name of ['round_raw', 'home_raw', 'away_raw', 'raw_payload']) {
    assert.ok(resultRows.columns.some((column) => column.name === name), name);
  }

  const analyticalRubbers = tableManifest.find((table) => table.destinationTable === 'rubbers');
  const analyticalColumns = new Set(analyticalRubbers.columns.map((column) => column.name));
  assert.equal(analyticalColumns.has('raw_payload'), false);
});

test('incremental export uses overlap and tuple high watermark', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const sql = exportSql(table, {
    lowerWatermark: '2026-08-08T04:00:00.000000Z',
    highWatermark: {
      timestamp: '2026-08-08T05:00:00.000000Z',
      tieBreaker: '11111111-1111-1111-1111-111111111111',
    },
  });

  assert.match(sql, /updated_at.*INTERVAL '3600 seconds'/s);
  assert.match(sql, /\("updated_at", "id"\) <=/);
  assert.match(sql, /ORDER BY "updated_at", "id"/);
  assert.doesNotMatch(sql, /raw_payload/);
});

test('string tuple watermarks do not cast source keys to UUID', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'scraping_pipeline_runs');
  const sql = exportSql(table, {
    highWatermark: {
      timestamp: '2026-08-08T05:00:00.000000Z',
      tieBreaker: '2026-08-08',
    },
  });

  assert.match(sql, /"run_key"\) <=/);
  assert.match(sql, /'2026-08-08'\)\n/s);
  assert.doesNotMatch(sql, /2026-08-08'::uuid/);
});

test('source provenance manifest preserves numeric scores and raw JSON as strings', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'tournament_match_candidates');
  assert.deepEqual(
    table.columns.find((column) => column.name === 'total_score'),
    { name: 'total_score', type: 'NUMERIC', nullable: false },
  );

  const sourceTable = tableManifest.find((entry) => entry.destinationTable === 'tournament_sources');
  assert.deepEqual(
    sourceTable.columns.find((column) => column.name === 'raw_payload'),
    { name: 'raw_payload', type: 'STRING', nullable: false },
  );
});

test('BigQuery schema is explicit and preserves required/nullable modes', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'fixtures');
  const schema = bigQuerySchema(table);
  assert.deepEqual(schema.find((field) => field.name === 'id'), {
    name: 'id', type: 'STRING', mode: 'REQUIRED',
  });
  assert.deepEqual(schema.find((field) => field.name === 'date_played'), {
    name: 'date_played', type: 'DATE', mode: 'NULLABLE',
  });
});

test('competition manifest preserves current calendar and entry metadata', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'competitions');
  const columns = new Map(table.columns.map((entry) => [entry.name, entry]));
  assert.deepEqual(columns.get('record_kind'), { name: 'record_kind', type: 'STRING', nullable: false });
  assert.deepEqual(columns.get('calendar_missing_count'), { name: 'calendar_missing_count', type: 'INTEGER', nullable: false });
  assert.deepEqual(columns.get('entry_fee'), { name: 'entry_fee', type: 'STRING', nullable: true });
  assert.deepEqual(columns.get('categories'), { name: 'categories', type: 'STRING', nullable: true });
});

test('partitioned destination DDL and replacement retain physical design', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const create = createDestinationSql({
    project: 'proj',
    rawDataset: 'raw',
    table,
  });
  const replace = replaceSql({
    project: 'proj',
    rawDataset: 'raw',
    stagingTable: '_stage_rubbers_x',
    table,
  });

  assert.match(create, /PARTITION BY DATE\(played_at\)/);
  assert.match(create, /CLUSTER BY fixture_id, home_player_1_id, away_player_1_id/);
  assert.match(replace, /CREATE OR REPLACE TABLE/);
  assert.match(replace, /PARTITION BY DATE\(played_at\)/);

  const fixtures = tableManifest.find((entry) => entry.destinationTable === 'fixtures');
  const fixtureCreate = createDestinationSql({ project: 'proj', rawDataset: 'raw', table: fixtures });
  assert.match(fixtureCreate, /PARTITION BY date_played/);
  assert.doesNotMatch(fixtureCreate, /DATE\(date_played\)/);
});

test('MERGE deduplicates staging rows and updates by primary key without unsafe partition filtering', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'rubbers');
  const sql = mergeSql({
    project: 'proj',
    rawDataset: 'raw',
    stagingTable: '_stage_rubbers_x',
    table,
  });

  assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY id ORDER BY updated_at DESC, id DESC\)/);
  assert.match(sql, /ON T\.id = S\.id/);
  assert.match(sql, /WHEN MATCHED THEN UPDATE SET/);
  assert.match(sql, /WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(sql, /T\.played_at BETWEEN/);
});

test('stage validation supports composite keys', () => {
  const table = {
    destinationTable: 'composite_table',
    primaryKey: ['first_id', 'second_id'],
  };
  const sql = stageValidationSql({ project: 'proj', rawDataset: 'raw', stagingTable: '_stage_composite', table });
  assert.match(sql, /COUNTIF\(first_id IS NULL OR second_id IS NULL\)/);
  assert.match(sql, /COUNT\(DISTINCT TO_JSON_STRING\(STRUCT\(first_id, second_id\)\)\)/);
});

test('pipeline bootstrap and commit advance watermark only in success transaction', () => {
  const table = tableManifest.find((entry) => entry.destinationTable === 'external_players');
  const bootstrap = pipelineBootstrapSql({ project: 'proj', pipelineDataset: 'pipeline' });
  const commit = commitRunSql({
    project: 'proj',
    pipelineDataset: 'pipeline',
    table,
    runId: 'run-1',
    startedAt: '2026-08-08T05:00:00.000Z',
    sourceRows: 10,
    highWatermark: {
      timestamp: '2026-08-08T05:00:00.000000Z',
      tieBreaker: '11111111-1111-1111-1111-111111111111',
    },
    mode: 'incremental-merge',
  });

  assert.match(bootstrap, /sync_watermarks/);
  assert.match(bootstrap, /sync_runs/);
  assert.match(bootstrap, /validation_results/);
  assert.match(commit, /BEGIN TRANSACTION;/);
  assert.match(commit, /MERGE `proj\.pipeline\.sync_watermarks`/);
  assert.match(commit, /status\).*'succeeded'/s);
  assert.match(commit, /COMMIT TRANSACTION;/);
  const validation = validationResultSql({
    project: 'proj',
    pipelineDataset: 'pipeline',
    runId: 'run-1',
    table,
    sourceRows: 10,
    stagedRows: 10,
    nullKeyCount: 0,
    duplicateKeyCount: 0,
    status: 'passed',
  });
  assert.match(validation, /INSERT INTO `proj\.pipeline\.validation_results`/);
  assert.match(validation, /'passed'/);
});

test('manifest validator rejects duplicate destinations and broken watermarks', () => {
  const good = tableManifest[0];
  assert.throws(
    () => validateTableManifest([good, { ...good }]),
    /Duplicate destination/,
  );

  const incremental = tableManifest.find((entry) => entry.mode === 'incremental-merge');
  assert.throws(
    () => validateTableManifest([{ ...incremental, watermark: { ...incremental.watermark, column: 'missing' } }]),
    /Invalid watermark/,
  );
});
