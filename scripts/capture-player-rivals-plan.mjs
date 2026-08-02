#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const requireFromDatabaseWorkspace = createRequire(
    new URL('../packages/db/package.json', import.meta.url),
);
const { Client } = requireFromDatabaseWorkspace('pg');

export function buildPlayerRivalsPlanQuery() {
    return `WITH relevant AS MATERIALIZED (
                SELECT
                    rubber.id AS encounter_id,
                    COALESCE(fixture.date_played::timestamp, rubber.played_at, fixture.created_at) AS played_at,
                    COALESCE(opponent.canonical_player_id, opponent.id) AS opponent_id,
                    COALESCE(canonical_opponent.name, opponent.name) AS opponent_name,
                    CASE
                        WHEN rubber.home_player_1_id = ANY($1::uuid[])
                        THEN CASE WHEN rubber.home_games_won > rubber.away_games_won THEN 1 ELSE 0 END
                        ELSE CASE WHEN rubber.away_games_won > rubber.home_games_won THEN 1 ELSE 0 END
                    END::int AS is_win
                FROM rubbers rubber
                JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                JOIN competitions competition ON competition.id = fixture.competition_id
                JOIN seasons season_row ON season_row.id = competition.season_id
                JOIN leagues league ON league.id = season_row.league_id
                JOIN external_players opponent
                  ON opponent.id = CASE
                      WHEN rubber.home_player_1_id = ANY($1::uuid[]) THEN rubber.away_player_1_id
                      ELSE rubber.home_player_1_id
                  END
                LEFT JOIN external_players canonical_opponent
                  ON canonical_opponent.id = COALESCE(opponent.canonical_player_id, opponent.id)
                WHERE (
                    rubber.home_player_1_id = ANY($1::uuid[])
                    OR rubber.away_player_1_id = ANY($1::uuid[])
                )
                  AND rubber.is_doubles = false
                  AND rubber.deleted_at IS NULL
                  AND rubber.outcome_type <> 'walkover'
                  AND fixture.deleted_at IS NULL
                  AND competition.deleted_at IS NULL
                  AND season_row.deleted_at IS NULL
                  AND league.deleted_at IS NULL
                  AND opponent.deleted_at IS NULL
                  AND (canonical_opponent.id IS NULL OR canonical_opponent.deleted_at IS NULL)
            ), sequenced AS (
                SELECT
                    relevant.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY opponent_id
                        ORDER BY played_at ASC, encounter_id ASC
                    )::int AS sequence_number,
                    COUNT(*) OVER (PARTITION BY opponent_id)::int AS opponent_played
                FROM relevant
            ), split_rows AS (
                SELECT
                    sequenced.*,
                    FLOOR(opponent_played / 2.0)::int AS split_at
                FROM sequenced
            ), aggregated AS (
                SELECT
                    opponent_id,
                    MAX(opponent_name) AS opponent_name,
                    COUNT(*)::int AS played,
                    SUM(is_win)::int AS wins,
                    (COUNT(*) - SUM(is_win))::int AS losses,
                    ROUND((SUM(is_win)::numeric / NULLIF(COUNT(*), 0)) * 100)::int AS win_rate,
                    ROUND((
                        SUM(is_win) FILTER (WHERE sequence_number <= split_at)::numeric
                        / NULLIF(COUNT(*) FILTER (WHERE sequence_number <= split_at), 0)
                    ) * 100)::int AS first_half_win_rate,
                    ROUND((
                        SUM(is_win) FILTER (WHERE sequence_number > split_at)::numeric
                        / NULLIF(COUNT(*) FILTER (WHERE sequence_number > split_at), 0)
                    ) * 100)::int AS second_half_win_rate
                FROM split_rows
                GROUP BY opponent_id
            ), ranked AS (
                SELECT
                    aggregated.*,
                    ROW_NUMBER() OVER (
                        ORDER BY win_rate ASC, played DESC, opponent_name ASC, opponent_id ASC
                    )::int AS toughest_rank,
                    ROW_NUMBER() OVER (
                        ORDER BY win_rate DESC, played DESC, opponent_name ASC, opponent_id ASC
                    )::int AS easiest_rank
                FROM aggregated
                WHERE played >= 3
            ), improving AS (
                SELECT
                    aggregated.*,
                    (second_half_win_rate - first_half_win_rate)::int AS delta_points
                FROM aggregated
                WHERE played >= 4
                  AND second_half_win_rate > first_half_win_rate
            ), improving_ranked AS (
                SELECT
                    improving.*,
                    ROW_NUMBER() OVER (
                        ORDER BY delta_points DESC, played DESC, opponent_name ASC, opponent_id ASC
                    )::int AS improvement_rank
                FROM improving
            ), categorized AS (
                SELECT
                    'toughest'::text AS category,
                    toughest_rank AS category_rank,
                    opponent_id,
                    opponent_name,
                    played,
                    wins,
                    losses,
                    win_rate,
                    NULL::int AS first_half_win_rate,
                    NULL::int AS second_half_win_rate,
                    NULL::int AS delta_points
                FROM ranked
                WHERE toughest_rank <= 4

                UNION ALL

                SELECT
                    'easiest'::text AS category,
                    easiest_rank AS category_rank,
                    opponent_id,
                    opponent_name,
                    played,
                    wins,
                    losses,
                    win_rate,
                    NULL::int AS first_half_win_rate,
                    NULL::int AS second_half_win_rate,
                    NULL::int AS delta_points
                FROM ranked
                WHERE easiest_rank <= 4

                UNION ALL

                SELECT
                    'improving'::text AS category,
                    improvement_rank AS category_rank,
                    opponent_id,
                    opponent_name,
                    played,
                    wins,
                    losses,
                    win_rate,
                    first_half_win_rate,
                    second_half_win_rate,
                    delta_points
                FROM improving_ranked
                WHERE improvement_rank <= 4
            )
            SELECT *
            FROM categorized
            WHERE category_rank <= 4
            ORDER BY
                CASE category WHEN 'toughest' THEN 1 WHEN 'easiest' THEN 2 ELSE 3 END,
                category_rank`;
}

async function findCandidate(client) {
    const result = await client.query(`
        WITH appearances AS (
            SELECT home_player_1_id AS player_id
            FROM rubbers
            WHERE home_player_1_id IS NOT NULL
              AND is_doubles = false
              AND deleted_at IS NULL
              AND outcome_type <> 'walkover'

            UNION ALL

            SELECT away_player_1_id AS player_id
            FROM rubbers
            WHERE away_player_1_id IS NOT NULL
              AND is_doubles = false
              AND deleted_at IS NULL
              AND outcome_type <> 'walkover'
        )
        SELECT COALESCE(player.canonical_player_id, player.id) AS canonical_id
        FROM appearances
        JOIN external_players player ON player.id = appearances.player_id
        WHERE player.deleted_at IS NULL
        GROUP BY COALESCE(player.canonical_player_id, player.id)
        ORDER BY COUNT(*) DESC
        LIMIT 1
    `);
    return result.rows[0]?.canonical_id ?? null;
}

async function sourceIdsForCanonicalPlayer(client, canonicalId) {
    const result = await client.query(
        `SELECT ARRAY_AGG(id ORDER BY id) AS source_ids
         FROM external_players
         WHERE COALESCE(canonical_player_id, id) = $1::uuid
           AND deleted_at IS NULL`,
        [canonicalId],
    );
    return result.rows[0]?.source_ids ?? [];
}

export async function capturePlayerRivalsPlan(client, analyze = false) {
    const canonicalId = await findCandidate(client);
    if (!canonicalId) {
        return { name: 'player-rivals-ranked-aggregation', skipped: true, reason: 'No singles player found' };
    }

    const sourceIds = await sourceIdsForCanonicalPlayer(client, canonicalId);
    if (sourceIds.length === 0) {
        return { name: 'player-rivals-ranked-aggregation', skipped: true, reason: 'No source IDs found' };
    }

    const prefix = analyze
        ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'
        : 'EXPLAIN (FORMAT JSON)';
    const result = await client.query(`${prefix} ${buildPlayerRivalsPlanQuery()}`, [sourceIds]);
    return {
        name: 'player-rivals-ranked-aggregation',
        skipped: false,
        canonical_player_id: canonicalId,
        source_id_count: sourceIds.length,
        plan: result.rows[0]?.['QUERY PLAN'] ?? [],
    };
}

function parseArgs(argv) {
    const config = {
        analyze: false,
        out: 'artifacts/player-rivals-query-plan.json',
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--analyze') {
            config.analyze = true;
        } else if (argument === '--out') {
            const value = argv[index + 1];
            if (!value) throw new Error('--out requires a value');
            config.out = value;
            index += 1;
        } else if (argument === '--help' || argument === '-h') {
            config.help = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return config;
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) {
        console.log('Usage: DATABASE_URL=... node scripts/capture-player-rivals-plan.mjs [--analyze] [--out FILE]');
        return;
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');

    const client = new Client({
        connectionString,
        application_name: 'tt-players-rivals-query-plan',
        statement_timeout: config.analyze ? 60_000 : 15_000,
        lock_timeout: 2_000,
    });
    await client.connect();
    try {
        const report = {
            generated_at: new Date().toISOString(),
            analyze: config.analyze,
            result: await capturePlayerRivalsPlan(client, config.analyze),
        };
        await mkdir(dirname(config.out), { recursive: true });
        await writeFile(config.out, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Wrote ${config.out}`);
    } finally {
        await client.end();
    }
}

const isDirectRun = process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
