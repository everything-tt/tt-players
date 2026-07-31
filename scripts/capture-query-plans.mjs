#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

function parseArgs(argv) {
    const config = {
        analyze: false,
        out: 'artifacts/backend-query-plans.json',
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

function explainPrefix(analyze) {
    return analyze
        ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'
        : 'EXPLAIN (FORMAT JSON)';
}

function walkPlan(node, summary) {
    summary.nodes += 1;
    summary.total_cost = Math.max(summary.total_cost, Number(node['Total Cost'] ?? 0));
    summary.plan_rows += Number(node['Plan Rows'] ?? 0);
    summary.actual_rows += Number(node['Actual Rows'] ?? 0);
    summary.shared_hit_blocks += Number(node['Shared Hit Blocks'] ?? 0);
    summary.shared_read_blocks += Number(node['Shared Read Blocks'] ?? 0);
    summary.temp_read_blocks += Number(node['Temp Read Blocks'] ?? 0);
    summary.temp_written_blocks += Number(node['Temp Written Blocks'] ?? 0);
    for (const child of node.Plans ?? []) walkPlan(child, summary);
}

export function summarizePlan(planDocument) {
    const root = planDocument?.[0];
    const summary = {
        planning_time_ms: Number(root?.['Planning Time'] ?? 0),
        execution_time_ms: Number(root?.['Execution Time'] ?? 0),
        nodes: 0,
        total_cost: 0,
        plan_rows: 0,
        actual_rows: 0,
        shared_hit_blocks: 0,
        shared_read_blocks: 0,
        temp_read_blocks: 0,
        temp_written_blocks: 0,
    };
    if (root?.Plan) walkPlan(root.Plan, summary);
    return summary;
}

async function firstValue(client, text, column) {
    const result = await client.query(text);
    return result.rows[0]?.[column] ?? null;
}

async function explain(client, name, text, values, analyze) {
    const result = await client.query(`${explainPrefix(analyze)} ${text}`, values);
    const document = result.rows[0]?.['QUERY PLAN'] ?? [];
    return {
        name,
        skipped: false,
        summary: summarizePlan(document),
        plan: document,
    };
}

export async function capturePlans(client, analyze) {
    const plans = [];

    plans.push(await explain(
        client,
        'source-quality-snapshot',
        `SELECT content
         FROM source_quality_snapshots
         WHERE key = 'global'`,
        [],
        analyze,
    ));

    plans.push(await explain(
        client,
        'global-ratings-page',
        `SELECT
             pr.player_id,
             ep.name AS player_name,
             pr.rating,
             pr.rating_deviation,
             pr.conservative_rating,
             pr.rated_matches,
             pr.rated_wins,
             pr.rated_losses,
             pr.provisional,
             pr.first_rated_at,
             pr.last_rated_at
         FROM player_ratings pr
         JOIN rating_models rm ON rm.id = pr.model_id
         JOIN external_players ep ON ep.id = pr.player_id
         WHERE rm.key = 'global-singles-glicko2-v1'
           AND ep.deleted_at IS NULL
           AND pr.provisional = false
         ORDER BY pr.conservative_rating DESC, pr.rated_matches DESC, ep.name ASC
         LIMIT 50`,
        [],
        analyze,
    ));

    const leagueId = await firstValue(
        client,
        `SELECT league_id
         FROM player_active_leagues
         GROUP BY league_id
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        'league_id',
    );
    if (leagueId) {
        plans.push(await explain(
            client,
            'league-ratings-page',
            `SELECT
                 rating.player_id,
                 player.name,
                 rating.conservative_rating,
                 rating.rated_matches
             FROM player_ratings rating
             JOIN rating_models model_row ON model_row.id = rating.model_id
             JOIN external_players player ON player.id = rating.player_id
             WHERE model_row.key = 'global-singles-glicko2-v1'
               AND player.deleted_at IS NULL
               AND rating.provisional = false
               AND EXISTS (
                   SELECT 1
                   FROM player_active_leagues membership
                   WHERE membership.player_id = rating.player_id
                     AND membership.league_id = $1::uuid
               )
             ORDER BY rating.conservative_rating DESC, rating.rated_matches DESC, player.name ASC
             LIMIT 50`,
            [leagueId],
            analyze,
        ));
    } else {
        plans.push({ name: 'league-ratings-page', skipped: true, reason: 'No active league membership' });
    }

    const teamId = await firstValue(
        client,
        `SELECT team_id
         FROM (
             SELECT home_team_id AS team_id FROM fixtures WHERE home_team_id IS NOT NULL
             UNION ALL
             SELECT away_team_id AS team_id FROM fixtures WHERE away_team_id IS NOT NULL
         ) teams
         GROUP BY team_id
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        'team_id',
    );
    if (teamId) {
        plans.push(await explain(
            client,
            'team-fixtures-page',
            `WITH paged_fixtures AS (
                 SELECT f.id, f.date_played
                 FROM fixtures f
                 WHERE (f.home_team_id = $1::uuid OR f.away_team_id = $1::uuid)
                   AND f.deleted_at IS NULL
                 ORDER BY f.date_played DESC, f.id DESC
                 LIMIT 20
             )
             SELECT pf.id, pf.date_played,
                    COUNT(r.id) FILTER (WHERE r.home_games_won > r.away_games_won) AS home_score,
                    COUNT(r.id) FILTER (WHERE r.away_games_won > r.home_games_won) AS away_score
             FROM paged_fixtures pf
             LEFT JOIN rubbers r ON r.fixture_id = pf.id AND r.deleted_at IS NULL
             GROUP BY pf.id, pf.date_played
             ORDER BY pf.date_played DESC, pf.id DESC`,
            [teamId],
            analyze,
        ));
    } else {
        plans.push({ name: 'team-fixtures-page', skipped: true, reason: 'No team fixtures' });
    }

    return plans;
}

function printHelp() {
    console.log(`Usage: DATABASE_URL=... node scripts/capture-query-plans.mjs [options]\n\nOptions:\n  --analyze       Execute queries and include timing/buffer data\n  --out FILE      JSON output path (default: artifacts/backend-query-plans.json)\n`);
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) {
        printHelp();
        return;
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');

    const client = new Client({
        connectionString,
        application_name: 'tt-players-query-plan-capture',
        statement_timeout: config.analyze ? 60_000 : 15_000,
        lock_timeout: 2_000,
    });

    await client.connect();
    try {
        const plans = await capturePlans(client, config.analyze);
        const report = {
            generated_at: new Date().toISOString(),
            analyze: config.analyze,
            plans,
        };
        await mkdir(dirname(config.out), { recursive: true });
        await writeFile(config.out, `${JSON.stringify(report, null, 2)}\n`);
        console.table(plans.map((plan) => ({
            query: plan.name,
            skipped: plan.skipped,
            execution_ms: plan.summary?.execution_time_ms ?? '-',
            shared_reads: plan.summary?.shared_read_blocks ?? '-',
            temp_written: plan.summary?.temp_written_blocks ?? '-',
        })));
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
