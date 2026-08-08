const idPattern = /^[a-z_][a-z0-9_]*$/;

export function pgIdentifier(value) {
  if (!idPattern.test(value)) throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

export function bqIdentifier(project, dataset, table) {
  for (const part of [project, dataset, table]) {
    if (!/^[A-Za-z0-9_.-]+$/.test(part)) throw new Error(`Unsafe BigQuery identifier component: ${part}`);
  }
  return `\`${project}.${dataset}.${table}\``;
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function postgresColumnExpression(column) {
  const name = pgIdentifier(column.name);
  if (column.type === 'STRING') return `${name}::text AS ${name}`;
  if (column.type === 'TIMESTAMP') {
    return `CASE WHEN ${name} IS NULL THEN NULL ELSE to_char(${name} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS ${name}`;
  }
  if (column.type === 'DATE') return `CASE WHEN ${name} IS NULL THEN NULL ELSE to_char(${name}::date, 'YYYY-MM-DD') END AS ${name}`;
  if (column.type === 'INTEGER') return `${name}::bigint AS ${name}`;
  if (column.type === 'NUMERIC') return `${name}::numeric AS ${name}`;
  if (column.type === 'BOOLEAN') return `${name}::boolean AS ${name}`;
  throw new Error(`Unsupported column type: ${column.type}`);
}

export function exportSql(table, { lowerWatermark = null, highWatermark = null, includeOrder = true } = {}) {
  const columns = table.columns.map(postgresColumnExpression).join(',\n        ');
  const predicates = [];
  if (lowerWatermark && table.watermark) {
    predicates.push(
      `${pgIdentifier(table.watermark.column)} >= TIMESTAMPTZ ${sqlString(lowerWatermark)} - INTERVAL '${Number(table.watermark.overlapSeconds)} seconds'`,
    );
  }
  if (highWatermark && table.watermark) {
    const tieBreaker = table.watermark.tieBreakerType === 'string'
      ? sqlString(highWatermark.tieBreaker)
      : `${sqlString(highWatermark.tieBreaker)}::uuid`;
    predicates.push(
      `(${pgIdentifier(table.watermark.column)}, ${pgIdentifier(table.watermark.tieBreaker)}) <= ` +
      `(TIMESTAMPTZ ${sqlString(highWatermark.timestamp)}, ${tieBreaker})`,
    );
  }
  const where = predicates.length ? `\n      WHERE ${predicates.join('\n        AND ')}` : '';
  const order = includeOrder && table.watermark
    ? `\n      ORDER BY ${pgIdentifier(table.watermark.column)}, ${pgIdentifier(table.watermark.tieBreaker)}`
    : '';

  return `SET TIME ZONE 'UTC';
SELECT row_to_json(export_row)::text
FROM (
      SELECT ${columns}
      FROM ${pgIdentifier(table.sourceSchema)}.${pgIdentifier(table.sourceTable)}${where}${order}
) AS export_row;`;
}

export function highWatermarkSql(table) {
  if (!table.watermark) throw new Error(`No watermark for ${table.destinationTable}`);
  return `SET TIME ZONE 'UTC';
SELECT to_char(${pgIdentifier(table.watermark.column)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
       || E'\\t' || ${pgIdentifier(table.watermark.tieBreaker)}::text
FROM ${pgIdentifier(table.sourceSchema)}.${pgIdentifier(table.sourceTable)}
ORDER BY ${pgIdentifier(table.watermark.column)} DESC, ${pgIdentifier(table.watermark.tieBreaker)} DESC
LIMIT 1;`;
}

export function bigQuerySchema(table) {
  return table.columns.map((column) => ({
    name: column.name,
    type: column.type,
    mode: column.nullable ? 'NULLABLE' : 'REQUIRED',
  }));
}

function destinationOptions(table) {
  const clauses = [];
  if (table.partitionColumn) {
    const partitionType = table.columns.find((column) => column.name === table.partitionColumn)?.type;
    const partitionExpression = table.partitionGranularity === 'MONTH'
      ? partitionType === 'DATE'
        ? `DATE_TRUNC(${table.partitionColumn}, MONTH)`
        : `DATE_TRUNC(DATE(${table.partitionColumn}), MONTH)`
      : partitionType === 'DATE'
        ? table.partitionColumn
        : `DATE(${table.partitionColumn})`;
    clauses.push(
      `PARTITION BY ${partitionExpression}`,
    );
  }
  if (table.clusterColumns?.length) clauses.push(`CLUSTER BY ${table.clusterColumns.join(', ')}`);
  return clauses.length ? `\n${clauses.join('\n')}` : '';
}

export function createDestinationSql({ project, rawDataset, table }) {
  const destination = bqIdentifier(project, rawDataset, table.destinationTable);
  const columns = table.columns.map((column) =>
    `  ${column.name} ${column.type}`,
  ).join(',\n');
  return `CREATE TABLE IF NOT EXISTS ${destination} (\n${columns}\n)${destinationOptions(table)};`;
}

export function replaceSql({ project, rawDataset, stagingTable, table }) {
  const destination = bqIdentifier(project, rawDataset, table.destinationTable);
  const staging = bqIdentifier(project, rawDataset, stagingTable);
  return `CREATE OR REPLACE TABLE ${destination}${destinationOptions(table)} AS
SELECT * FROM ${staging};`;
}

export function replaceEmptySql({ project, rawDataset, table }) {
  const destination = bqIdentifier(project, rawDataset, table.destinationTable);
  const columns = table.columns.map((column) => `  ${column.name} ${column.type}`).join(',\n');
  return `CREATE OR REPLACE TABLE ${destination} (\n${columns}\n)${destinationOptions(table)};`;
}

export function stageValidationSql({ project, rawDataset, stagingTable, table }) {
  const staging = bqIdentifier(project, rawDataset, stagingTable);
  const key = table.primaryKey.length === 1
    ? table.primaryKey[0]
    : `TO_JSON_STRING(STRUCT(${table.primaryKey.join(', ')}))`;
  const nullKey = table.primaryKey.map((column) => `${column} IS NULL`).join(' OR ');
  return `SELECT
  COUNT(*) AS row_count,
  COUNTIF(${nullKey}) AS null_key_count,
  COUNT(*) - COUNT(DISTINCT ${key}) AS duplicate_key_count
FROM ${staging};`;
}

export function mergeSql({ project, rawDataset, stagingTable, table }) {
  const destination = bqIdentifier(project, rawDataset, table.destinationTable);
  const staging = bqIdentifier(project, rawDataset, stagingTable);
  const keyJoin = table.primaryKey.map((key) => `T.${key} = S.${key}`).join(' AND ');
  const assignments = table.columns
    .filter((column) => !table.primaryKey.includes(column.name))
    .map((column) => `${column.name} = S.${column.name}`)
    .join(',\n    ');
  const names = table.columns.map((column) => column.name).join(', ');
  const values = table.columns.map((column) => `S.${column.name}`).join(', ');
  const order = table.watermark
    ? `${table.watermark.column} DESC, ${table.watermark.tieBreaker} DESC`
    : table.primaryKey.map((key) => `${key} DESC`).join(', ');

  return `MERGE ${destination} T
USING (
  SELECT * EXCEPT(_row_number)
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY ${table.primaryKey.join(', ')} ORDER BY ${order}) AS _row_number
    FROM ${staging}
  )
  WHERE _row_number = 1
) S
ON ${keyJoin}
WHEN MATCHED THEN UPDATE SET
    ${assignments}
WHEN NOT MATCHED THEN INSERT (${names})
VALUES (${values});`;
}

export function pipelineBootstrapSql({ project, pipelineDataset }) {
  const watermarks = bqIdentifier(project, pipelineDataset, 'sync_watermarks');
  const runs = bqIdentifier(project, pipelineDataset, 'sync_runs');
  const validations = bqIdentifier(project, pipelineDataset, 'validation_results');
  return `CREATE TABLE IF NOT EXISTS ${watermarks} (
  table_name STRING,
  watermark TIMESTAMP,
  tie_breaker STRING,
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ${runs} (
  run_id STRING,
  table_name STRING,
  mode STRING,
  source_rows INT64,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status STRING
);
CREATE TABLE IF NOT EXISTS ${validations} (
  run_id STRING,
  table_name STRING,
  source_rows INT64,
  staged_rows INT64,
  null_key_count INT64,
  duplicate_key_count INT64,
  checked_at TIMESTAMP,
  status STRING
);`;
}

export function validationResultSql({
  project,
  pipelineDataset,
  runId,
  table,
  sourceRows,
  stagedRows,
  nullKeyCount,
  duplicateKeyCount,
  status,
}) {
  const validations = bqIdentifier(project, pipelineDataset, 'validation_results');
  return `INSERT INTO ${validations}
  (run_id, table_name, source_rows, staged_rows, null_key_count, duplicate_key_count, checked_at, status)
VALUES (${sqlString(runId)}, ${sqlString(table.destinationTable)}, ${Number(sourceRows)}, ${Number(stagedRows)},
        ${Number(nullKeyCount)}, ${Number(duplicateKeyCount)}, CURRENT_TIMESTAMP(), ${sqlString(status)});`;
}

export function readWatermarkSql({ project, pipelineDataset, tableName }) {
  const watermarks = bqIdentifier(project, pipelineDataset, 'sync_watermarks');
  return `SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', watermark) AS watermark, tie_breaker
FROM ${watermarks}
WHERE table_name = ${sqlString(tableName)}
ORDER BY updated_at DESC
LIMIT 1;`;
}

export function commitRunSql({ project, pipelineDataset, table, runId, startedAt, sourceRows, highWatermark, mode }) {
  const watermarks = bqIdentifier(project, pipelineDataset, 'sync_watermarks');
  const runs = bqIdentifier(project, pipelineDataset, 'sync_runs');
  const watermarkStatement = highWatermark
    ? `MERGE ${watermarks} T
USING (SELECT ${sqlString(table.destinationTable)} AS table_name,
              TIMESTAMP(${sqlString(highWatermark.timestamp)}) AS watermark,
              ${sqlString(highWatermark.tieBreaker)} AS tie_breaker) S
ON T.table_name = S.table_name
WHEN MATCHED THEN UPDATE SET watermark = S.watermark, tie_breaker = S.tie_breaker, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (table_name, watermark, tie_breaker, updated_at)
VALUES (S.table_name, S.watermark, S.tie_breaker, CURRENT_TIMESTAMP());`
    : '';

  return `BEGIN TRANSACTION;
${watermarkStatement}
INSERT INTO ${runs} (run_id, table_name, mode, source_rows, started_at, completed_at, status)
VALUES (${sqlString(runId)}, ${sqlString(table.destinationTable)}, ${sqlString(mode)}, ${Number(sourceRows)},
        TIMESTAMP(${sqlString(startedAt)}), CURRENT_TIMESTAMP(), 'succeeded');
COMMIT TRANSACTION;`;
}

export function failureRunSql({ project, pipelineDataset, table, runId, startedAt, sourceRows = 0, mode }) {
  const runs = bqIdentifier(project, pipelineDataset, 'sync_runs');
  return `INSERT INTO ${runs} (run_id, table_name, mode, source_rows, started_at, completed_at, status)
VALUES (${sqlString(runId)}, ${sqlString(table.destinationTable)}, ${sqlString(mode)}, ${Number(sourceRows)},
        TIMESTAMP(${sqlString(startedAt)}), CURRENT_TIMESTAMP(), 'failed');`;
}

export function resetWatermarkSql({ project, pipelineDataset, tableName }) {
  const watermarks = bqIdentifier(project, pipelineDataset, 'sync_watermarks');
  return `DELETE FROM ${watermarks} WHERE table_name = ${sqlString(tableName)};`;
}
