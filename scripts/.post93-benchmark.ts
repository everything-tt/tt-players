import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { buildApp } from '../apps/api/src/app.js';

const { Pool } = pg;
const label = process.argv[2] ?? 'unknown';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString, max: 4 });
const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
const app = await buildApp(db);
await app.ready();

const ids = await pool.query(`
    SELECT
        uuid_from_text('league-1')::text AS league_id,
        uuid_from_text('team-1-1-1')::text AS team_id
`);
const leagueId = ids.rows[0].league_id;
const teamId = ids.rows[0].team_id;

const cases = [
    { name: 'team-form', url: `/api/teams/${teamId}/form` },
    { name: 'league-overview-selected', url: `/api/leagues/overview?league_ids=${leagueId}` },
    { name: 'league-snapshot', url: `/api/leagues/${leagueId}/snapshot` },
];

function percentile(sorted: number[], fraction: number): number {
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

for (const benchmarkCase of cases) {
    for (let warmup = 0; warmup < 3; warmup += 1) {
        const response = await app.inject({ method: 'GET', url: benchmarkCase.url });
        if (response.statusCode !== 200) {
            throw new Error(`${benchmarkCase.name} warmup returned ${response.statusCode}: ${response.payload}`);
        }
    }

    const durations: number[] = [];
    let responseBytes = 0;
    let resultItems = 0;
    for (let iteration = 0; iteration < 20; iteration += 1) {
        const started = performance.now();
        const response = await app.inject({ method: 'GET', url: benchmarkCase.url });
        durations.push(performance.now() - started);
        if (response.statusCode !== 200) {
            throw new Error(`${benchmarkCase.name} returned ${response.statusCode}: ${response.payload}`);
        }
        responseBytes = Buffer.byteLength(response.payload);
        const body = response.json() as any;
        if (benchmarkCase.name === 'team-form') resultItems = body.form.length;
        if (benchmarkCase.name === 'league-overview-selected') resultItems = body.data.length;
        if (benchmarkCase.name === 'league-snapshot') resultItems = body.divisions.length;
    }

    durations.sort((left, right) => left - right);
    const result = {
        label,
        query: benchmarkCase.name,
        p50_ms: Number(percentile(durations, 0.50).toFixed(3)),
        p95_ms: Number(percentile(durations, 0.95).toFixed(3)),
        min_ms: Number(durations[0].toFixed(3)),
        max_ms: Number(durations[durations.length - 1].toFixed(3)),
        response_bytes: responseBytes,
        result_items: resultItems,
    };
    console.log(`POST93_RESULT ${JSON.stringify(result)}`);
}

await app.close();
await db.destroy();
