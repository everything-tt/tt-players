const column = (name, type, nullable = false) => ({ name, type, nullable });

export const tableManifest = [
  {
    sourceSchema: 'public',
    sourceTable: 'platforms',
    destinationTable: 'platforms',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('name', 'STRING'), column('base_url', 'STRING'),
      column('created_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'leagues',
    destinationTable: 'leagues',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING'), column('created_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'regions',
    destinationTable: 'regions',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('slug', 'STRING'), column('name', 'STRING'),
      column('created_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'league_regions',
    destinationTable: 'league_regions',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('league_id', 'STRING'), column('region_id', 'STRING'),
      column('created_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'seasons',
    destinationTable: 'seasons',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('league_id', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING'), column('is_active', 'BOOLEAN'), column('created_at', 'TIMESTAMP'),
      column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'competitions',
    destinationTable: 'competitions',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('season_id', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING'), column('display_name', 'STRING', true), column('event_date', 'DATE', true),
      column('category', 'STRING', true), column('type', 'STRING'), column('source', 'STRING', true),
      column('source_url', 'STRING', true), column('last_scraped_at', 'TIMESTAMP', true),
      column('start_date', 'DATE', true), column('end_date', 'DATE', true),
      column('venue_name', 'STRING', true), column('venue_address', 'STRING', true),
      column('venue_town', 'STRING', true), column('venue_postcode', 'STRING', true),
      column('entry_deadline', 'TIMESTAMP', true), column('entry_url', 'STRING', true),
      column('information_url', 'STRING', true), column('event_status', 'STRING'),
      column('status_override', 'STRING', true), column('normalized_name', 'STRING', true),
      column('normalized_venue', 'STRING', true), column('calendar_first_seen_at', 'TIMESTAMP', true),
      column('calendar_last_seen_at', 'TIMESTAMP', true), column('calendar_missing_count', 'INTEGER'),
      column('record_kind', 'STRING'), column('matched_calendar_competition_id', 'STRING', true),
      column('processed_at', 'TIMESTAMP', true), column('description', 'STRING', true),
      column('venue_url', 'STRING', true), column('organizer_name', 'STRING', true),
      column('organizer_url', 'STRING', true), column('publication_status', 'STRING', true),
      column('entry_fee', 'STRING', true),
      // JSONB is preserved as canonical JSON text; the first version does not
      // flatten user-facing category/fee metadata into a lossy shape.
      column('categories', 'STRING', true),
      column('created_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'teams',
    destinationTable: 'teams',
    mode: 'full-replace',
    primaryKey: ['id'],
    columns: [
      column('id', 'STRING'), column('competition_id', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING'), column('created_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'external_players',
    destinationTable: 'external_players',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['platform_id', 'canonical_player_id'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('external_id', 'STRING', true),
      column('canonical_player_id', 'STRING', true), column('name', 'STRING'),
      column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'league_standings',
    destinationTable: 'league_standings',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['competition_id', 'team_id'],
    columns: [
      column('id', 'STRING'), column('competition_id', 'STRING'), column('team_id', 'STRING'),
      column('position', 'INTEGER'), column('played', 'INTEGER'), column('won', 'INTEGER'),
      column('drawn', 'INTEGER'), column('lost', 'INTEGER'), column('points', 'INTEGER'),
      column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'fixtures',
    destinationTable: 'fixtures',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    partitionColumn: 'date_played',
    clusterColumns: ['competition_id', 'status'],
    columns: [
      column('id', 'STRING'), column('competition_id', 'STRING'), column('external_id', 'STRING'),
      column('home_team_id', 'STRING', true), column('away_team_id', 'STRING', true),
      column('date_played', 'DATE', true), column('status', 'STRING'), column('round_name', 'STRING', true),
      column('round_order', 'INTEGER', true), column('created_at', 'TIMESTAMP'),
      column('updated_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'rubbers',
    destinationTable: 'rubbers',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    partitionColumn: 'played_at',
    clusterColumns: ['fixture_id', 'home_player_1_id', 'away_player_1_id'],
    columns: [
      column('id', 'STRING'), column('fixture_id', 'STRING'), column('external_id', 'STRING'),
      column('is_doubles', 'BOOLEAN'), column('home_player_1_id', 'STRING', true),
      column('home_player_2_id', 'STRING', true), column('away_player_1_id', 'STRING', true),
      column('away_player_2_id', 'STRING', true), column('home_games_won', 'INTEGER'),
      column('away_games_won', 'INTEGER'), column('home_points_scored', 'INTEGER', true),
      column('away_points_scored', 'INTEGER', true), column('outcome_type', 'STRING'),
      column('score_source', 'STRING'), column('played_at', 'TIMESTAMP', true),
      column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'), column('deleted_at', 'TIMESTAMP', true),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'ranking_categories',
    destinationTable: 'ranking_categories',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['platform_id'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING'), column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'ranking_periods',
    destinationTable: 'ranking_periods',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['platform_id'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('external_id', 'STRING'),
      column('label', 'STRING'), column('period_end_date', 'DATE', true),
      column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'ranking_entries',
    destinationTable: 'ranking_entries',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['category_id', 'player_id', 'period_id'],
    columns: [
      column('id', 'STRING'), column('period_id', 'STRING'), column('category_id', 'STRING'),
      column('player_id', 'STRING'), column('list_kind', 'STRING'),
      column('ranking_row_external_id', 'STRING', true), column('athlete_external_id', 'STRING', true),
      column('rank', 'INTEGER', true), column('points', 'INTEGER', true),
      column('county_country', 'STRING', true), column('inactive_periods', 'INTEGER', true),
      column('is_initial_rating', 'BOOLEAN'), column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'sport80_event_scrape_state',
    destinationTable: 'sport80_event_scrape_state',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['status'],
    columns: [
      column('id', 'STRING'), column('event_id', 'STRING'), column('event_name', 'STRING', true),
      column('event_date', 'DATE', true), column('category', 'STRING', true), column('status', 'STRING'),
      column('result_rows', 'INTEGER', true), column('last_error', 'STRING', true),
      column('first_seen_at', 'TIMESTAMP'), column('last_attempted_at', 'TIMESTAMP', true),
      column('processed_at', 'TIMESTAMP', true), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'source_events',
    destinationTable: 'source_events',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['platform_id', 'source'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('source', 'STRING'),
      column('external_id', 'STRING'), column('name', 'STRING'), column('event_date', 'DATE', true),
      column('category', 'STRING', true), column('public_url', 'STRING', true),
      column('raw_payload', 'STRING'),
      column('canonical_competition_id', 'STRING', true), column('first_seen_at', 'TIMESTAMP'),
      column('last_seen_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'source_event_result_rows',
    destinationTable: 'source_event_result_rows',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    partitionColumn: 'played_at',
    clusterColumns: ['source_event_id', 'home_player_external_id', 'away_player_external_id'],
    columns: [
      column('id', 'STRING'), column('source_event_id', 'STRING'), column('source', 'STRING'),
      column('external_id', 'STRING'), column('played_at', 'TIMESTAMP', true),
      column('round_name', 'STRING', true), column('round_order', 'INTEGER', true),
      column('round_raw', 'STRING'), column('home_raw', 'STRING'), column('away_raw', 'STRING'),
      column('home_player_name', 'STRING'), column('home_player_external_id', 'STRING'),
      column('away_player_name', 'STRING'), column('away_player_external_id', 'STRING'),
      column('winner_side', 'STRING'), column('canonical_rubber_id', 'STRING', true),
      column('raw_payload', 'STRING'),
      column('first_seen_at', 'TIMESTAMP'), column('last_seen_at', 'TIMESTAMP'),
      column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'staging',
    sourceTable: 'raw_scrape_logs',
    destinationTable: 'raw_scrape_logs',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    partitionColumn: 'scraped_at',
    clusterColumns: ['platform_id', 'status'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('endpoint_url', 'STRING'),
      column('raw_payload', 'STRING'), column('payload_hash', 'STRING'),
      column('scraped_at', 'TIMESTAMP'), column('status', 'STRING'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'source_instances',
    destinationTable: 'source_instances',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['adapter_key', 'enabled'],
    columns: [
      column('id', 'STRING'), column('platform_id', 'STRING'), column('key', 'STRING'),
      column('name', 'STRING'), column('base_url', 'STRING'), column('adapter_key', 'STRING'),
      column('enabled', 'BOOLEAN'), column('config', 'STRING'),
      column('first_seen_at', 'TIMESTAMP'), column('last_seen_at', 'TIMESTAMP'),
      column('created_at', 'TIMESTAMP'), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'source_resources',
    destinationTable: 'source_resources',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['resource_type', 'enabled', 'consecutive_failures'],
    columns: [
      column('id', 'STRING'), column('source_instance_id', 'STRING'),
      column('resource_type', 'STRING'), column('external_id', 'STRING'),
      column('name', 'STRING', true), column('public_url', 'STRING', true),
      column('adapter_version', 'STRING'), column('refresh_policy', 'STRING'),
      column('enabled', 'BOOLEAN'), column('league_id', 'STRING', true),
      column('season_id', 'STRING', true), column('competition_id', 'STRING', true),
      column('last_fetched_at', 'TIMESTAMP', true), column('last_succeeded_at', 'TIMESTAMP', true),
      column('last_parsed_at', 'TIMESTAMP', true), column('last_error', 'STRING', true),
      column('consecutive_failures', 'INTEGER'), column('created_at', 'TIMESTAMP'),
      column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'tournament_sources',
    destinationTable: 'tournament_sources',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['provider', 'source_type', 'competition_id'],
    columns: [
      column('id', 'STRING'), column('competition_id', 'STRING'), column('provider', 'STRING'),
      column('source_type', 'STRING'), column('external_id', 'STRING', true),
      column('source_url', 'STRING'), column('source_key', 'STRING'),
      column('payload_hash', 'STRING', true), column('raw_payload', 'STRING'),
      column('first_seen_at', 'TIMESTAMP'), column('last_seen_at', 'TIMESTAMP'),
      column('missing_count', 'INTEGER'), column('match_method', 'STRING', true),
      column('match_confidence', 'NUMERIC', true), column('created_at', 'TIMESTAMP'),
      column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'tournament_match_candidates',
    destinationTable: 'tournament_match_candidates',
    mode: 'incremental-merge',
    primaryKey: ['id'],
    watermark: { column: 'updated_at', tieBreaker: 'id', overlapSeconds: 3600 },
    clusterColumns: ['incoming_provider', 'status', 'candidate_competition_id'],
    columns: [
      column('id', 'STRING'), column('incoming_provider', 'STRING'),
      column('incoming_external_id', 'STRING', true), column('incoming_name', 'STRING'),
      column('incoming_date', 'DATE', true), column('incoming_venue', 'STRING', true),
      column('candidate_competition_id', 'STRING'), column('name_score', 'NUMERIC'),
      column('date_score', 'NUMERIC'), column('venue_score', 'NUMERIC'),
      column('category_score', 'NUMERIC'), column('total_score', 'NUMERIC'),
      column('embedding_score', 'NUMERIC', true), column('score_evidence', 'STRING'),
      column('status', 'STRING'), column('resolution', 'STRING', true),
      column('reviewed_at', 'TIMESTAMP', true), column('created_at', 'TIMESTAMP'),
      column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'scraping_pipeline_runs',
    destinationTable: 'scraping_pipeline_runs',
    mode: 'incremental-merge',
    primaryKey: ['run_key'],
    watermark: {
      column: 'updated_at', tieBreaker: 'run_key', tieBreakerType: 'string', overlapSeconds: 3600,
    },
    clusterColumns: ['status', 'current_stage'],
    columns: [
      column('run_key', 'STRING'), column('window_start', 'TIMESTAMP'),
      column('status', 'STRING'), column('current_stage', 'STRING'),
      column('started_at', 'TIMESTAMP'), column('finished_at', 'TIMESTAMP', true),
      column('duration_ms', 'INTEGER', true), column('attempt_count', 'INTEGER'),
      column('error_message', 'STRING', true), column('updated_at', 'TIMESTAMP'),
    ],
  },
  {
    sourceSchema: 'public',
    sourceTable: 'scraping_pipeline_run_stages',
    destinationTable: 'scraping_pipeline_run_stages',
    mode: 'incremental-merge',
    primaryKey: ['run_key', 'stage'],
    watermark: {
      column: 'updated_at', tieBreaker: 'run_key', tieBreakerType: 'string', overlapSeconds: 3600,
    },
    clusterColumns: ['stage', 'status'],
    columns: [
      column('run_key', 'STRING'), column('stage', 'STRING'), column('status', 'STRING'),
      column('started_at', 'TIMESTAMP'), column('finished_at', 'TIMESTAMP', true),
      column('duration_ms', 'INTEGER', true), column('attempt_count', 'INTEGER'),
      column('summary', 'STRING'), column('error_message', 'STRING', true),
      column('updated_at', 'TIMESTAMP'),
    ],
  },
];

const identifierPattern = /^[a-z_][a-z0-9_]*$/;
const supportedTypes = new Set(['STRING', 'TIMESTAMP', 'DATE', 'INTEGER', 'NUMERIC', 'BOOLEAN']);

export function validateTableManifest(manifest = tableManifest) {
  const destinations = new Set();
  for (const table of manifest) {
    if (!Array.isArray(table.primaryKey) || table.primaryKey.length === 0) {
      throw new Error(`Missing primary key for ${table.destinationTable}`);
    }
    for (const value of [table.sourceSchema, table.sourceTable, table.destinationTable, ...table.primaryKey]) {
      if (typeof value !== 'string' || !identifierPattern.test(value)) throw new Error(`Unsafe identifier: ${value}`);
    }
    if (destinations.has(table.destinationTable)) throw new Error(`Duplicate destination: ${table.destinationTable}`);
    destinations.add(table.destinationTable);
    if (!['full-replace', 'incremental-merge'].includes(table.mode)) {
      throw new Error(`Invalid sync mode for ${table.destinationTable}: ${table.mode}`);
    }
    const names = new Set();
    for (const entry of table.columns) {
      if (typeof entry.name !== 'string' || !identifierPattern.test(entry.name)) {
        throw new Error(`Unsafe column identifier in ${table.destinationTable}: ${entry.name}`);
      }
      if (names.has(entry.name)) throw new Error(`Duplicate column ${entry.name} in ${table.destinationTable}`);
      if (!supportedTypes.has(entry.type)) throw new Error(`Unsupported column type in ${table.destinationTable}: ${entry.type}`);
      names.add(entry.name);
    }
    for (const key of table.primaryKey) {
      if (!names.has(key)) throw new Error(`Missing primary key ${key} in ${table.destinationTable}`);
    }
    if (table.mode === 'incremental-merge') {
      if (!table.watermark || !names.has(table.watermark.column) || !names.has(table.watermark.tieBreaker)) {
        throw new Error(`Invalid watermark definition for ${table.destinationTable}`);
      }
      if (table.watermark.tieBreakerType && !['uuid', 'string'].includes(table.watermark.tieBreakerType)) {
        throw new Error(`Invalid watermark tie-breaker type for ${table.destinationTable}`);
      }
      const watermarkColumn = table.columns.find((entry) => entry.name === table.watermark.column);
      if (watermarkColumn?.type !== 'TIMESTAMP' || !Number.isInteger(table.watermark.overlapSeconds) || table.watermark.overlapSeconds < 0) {
        throw new Error(`Invalid watermark definition for ${table.destinationTable}`);
      }
    }
    if (table.partitionColumn && !names.has(table.partitionColumn)) {
      throw new Error(`Missing partition column in ${table.destinationTable}`);
    }
    for (const clusterColumn of table.clusterColumns ?? []) {
      if (!names.has(clusterColumn)) throw new Error(`Missing cluster column in ${table.destinationTable}: ${clusterColumn}`);
    }
  }
  return manifest;
}
