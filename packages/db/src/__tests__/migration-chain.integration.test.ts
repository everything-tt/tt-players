import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

const TEST_DATABASE_NAME = 'tt_players_migration_chain_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DATABASE_NAME}`;
const packageDirectory = path.resolve(import.meta.dirname, '..', '..');
const migrationDirectory = path.resolve(import.meta.dirname, '..', 'migrations');

async function recreateTestDatabase(): Promise<void> {
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await pool.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await pool.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
        await pool.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
        await pool.query(`ALTER DATABASE ${TEST_DATABASE_NAME} SET search_path TO public, staging`);
    } finally {
        await pool.end();
    }
}

async function dropTestDatabase(): Promise<void> {
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await pool.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await pool.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
    } finally {
        await pool.end();
    }
}

async function migrationNamesOnDisk(): Promise<string[]> {
    return (await readdir(migrationDirectory))
        .filter((fileName) => /^\d+_.+\.ts$/.test(fileName))
        .map((fileName) => fileName.replace(/\.ts$/, ''))
        .sort((left, right) => left.localeCompare(right));
}

async function executedMigrationNames(): Promise<string[]> {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
        const result = await pool.query<{ name: string }>(`
            SELECT name
            FROM kysely_migration
            ORDER BY timestamp ASC, name ASC
        `);
        return result.rows.map((row) => row.name);
    } finally {
        await pool.end();
    }
}

describe('production migration chain', () => {
    beforeAll(async () => {
        await recreateTestDatabase();
    });

    afterAll(async () => {
        await dropTestDatabase();
    });

    it('executes and records every numbered migration file', async () => {
        const migration = spawnSync(
            'pnpm',
            ['exec', 'tsx', 'src/migrate.ts'],
            {
                cwd: packageDirectory,
                env: {
                    ...process.env,
                    DATABASE_URL: TEST_DATABASE_URL,
                },
                encoding: 'utf8',
                timeout: 120_000,
            },
        );

        expect(
            migration.status,
            `Production migrator failed.\nstdout:\n${migration.stdout}\nstderr:\n${migration.stderr}`,
        ).toBe(0);

        expect(await executedMigrationNames()).toEqual(await migrationNamesOnDisk());
    }, 120_000);

    it('keeps canonical event metadata synchronized from the raw TTE calendar payload', async () => {
        const pool = new Pool({ connectionString: TEST_DATABASE_URL });
        try {
            const platform = await pool.query<{ id: string }>(`
                INSERT INTO platforms (name, base_url)
                VALUES ('Metadata Test', 'https://metadata-test.example')
                RETURNING id
            `);
            const league = await pool.query<{ id: string }>(`
                INSERT INTO leagues (platform_id, external_id, name)
                VALUES ($1, 'metadata-test', 'Metadata Test')
                RETURNING id
            `, [platform.rows[0].id]);
            const season = await pool.query<{ id: string }>(`
                INSERT INTO seasons (league_id, external_id, name)
                VALUES ($1, '2026', '2026')
                RETURNING id
            `, [league.rows[0].id]);
            const competition = await pool.query<{ id: string }>(`
                INSERT INTO competitions (season_id, external_id, name, type)
                VALUES ($1, 'metadata-event', 'Metadata Event', 'individual')
                RETURNING id
            `, [season.rows[0].id]);

            await pool.query(`
                INSERT INTO tournament_sources (
                    competition_id,
                    provider,
                    source_type,
                    source_url,
                    source_key,
                    raw_payload
                )
                VALUES ($1, 'tte', 'calendar', $2, 'metadata-event', $3::jsonb)
            `, [
                competition.rows[0].id,
                'https://www.tabletennisengland.co.uk/event/metadata-event/',
                JSON.stringify({
                    description: 'Raw event description',
                    venueUrl: 'https://venue.example',
                    organizerName: 'Raw Organiser',
                    organizerUrl: 'https://organiser.example',
                    publishedStatus: 'confirmed',
                }),
            ]);

            const first = await pool.query<{
                description: string | null;
                venue_url: string | null;
                organizer_name: string | null;
                organizer_url: string | null;
                publication_status: string | null;
            }>(`
                SELECT description, venue_url, organizer_name, organizer_url, publication_status
                FROM competitions
                WHERE id = $1
            `, [competition.rows[0].id]);

            expect(first.rows[0]).toEqual({
                description: 'Raw event description',
                venue_url: 'https://venue.example',
                organizer_name: 'Raw Organiser',
                organizer_url: 'https://organiser.example',
                publication_status: 'confirmed',
            });

            await pool.query(`
                UPDATE tournament_sources
                SET raw_payload = $2::jsonb,
                    updated_at = now()
                WHERE competition_id = $1
                  AND provider = 'tte'
                  AND source_type = 'calendar'
            `, [
                competition.rows[0].id,
                JSON.stringify({
                    description: 'Updated raw description',
                    venueUrl: 'https://new-venue.example',
                    organizerName: 'Updated Organiser',
                    organizerUrl: 'https://new-organiser.example',
                    publishedStatus: 'provisional',
                }),
            ]);

            const updated = await pool.query(`
                SELECT description, venue_url, organizer_name, organizer_url, publication_status
                FROM competitions
                WHERE id = $1
            `, [competition.rows[0].id]);

            expect(updated.rows[0]).toEqual({
                description: 'Updated raw description',
                venue_url: 'https://new-venue.example',
                organizer_name: 'Updated Organiser',
                organizer_url: 'https://new-organiser.example',
                publication_status: 'provisional',
            });
        } finally {
            await pool.end();
        }
    }, 120_000);

    it('excludes non-completed fixtures from ratings and dirties ratings on status changes', async () => {
        const pool = new Pool({ connectionString: TEST_DATABASE_URL });
        try {
            const executed = await executedMigrationNames();
            const targetIndex = executed.indexOf('054_gate_ratings_by_fixture_status');
            expect(targetIndex).toBeGreaterThanOrEqual(0);
            const rollbackCount = executed.length - targetIndex;

            for (let rollback = 0; rollback < rollbackCount; rollback += 1) {
                const migrationDown = spawnSync(
                    'pnpm',
                    ['exec', 'tsx', 'src/migrate-down.ts'],
                    {
                        cwd: packageDirectory,
                        env: {
                            ...process.env,
                            DATABASE_URL: TEST_DATABASE_URL,
                        },
                        encoding: 'utf8',
                        timeout: 120_000,
                    },
                );
                expect(
                    migrationDown.status,
                    `Migration rollback failed.\nstdout:\n${migrationDown.stdout}\nstderr:\n${migrationDown.stderr}`,
                ).toBe(0);
            }

            const platform = await pool.query<{ id: string }>(`
                INSERT INTO platforms (name, base_url)
                VALUES ('Rating Gate Test', 'https://rating-gate.example')
                RETURNING id
            `);
            const league = await pool.query<{ id: string }>(`
                INSERT INTO leagues (platform_id, external_id, name)
                VALUES ($1, 'rating-gate', 'Rating Gate Test')
                RETURNING id
            `, [platform.rows[0].id]);
            const season = await pool.query<{ id: string }>(`
                INSERT INTO seasons (league_id, external_id, name)
                VALUES ($1, '2026', '2026')
                RETURNING id
            `, [league.rows[0].id]);
            const competition = await pool.query<{ id: string }>(`
                INSERT INTO competitions (season_id, external_id, name, type)
                VALUES ($1, 'rating-gate', 'Rating Gate Test', 'league')
                RETURNING id
            `, [season.rows[0].id]);
            const players = await pool.query<{ id: string }>(`
                INSERT INTO external_players (platform_id, external_id, name)
                VALUES
                    ($1, 'rating-home', 'Rating Home'),
                    ($1, 'rating-away', 'Rating Away')
                RETURNING id
            `, [platform.rows[0].id]);
            const fixtures = await pool.query<{ id: string; status: string }>(`
                INSERT INTO fixtures (
                    competition_id,
                    external_id,
                    date_played,
                    status
                )
                VALUES
                    ($1, 'rating-completed', '2026-01-10', 'completed'),
                    ($1, 'rating-upcoming', '2026-01-11', 'upcoming'),
                    ($1, 'rating-postponed', '2026-01-12', 'postponed')
                RETURNING id, status::text
            `, [competition.rows[0].id]);
            const fixtureByStatus = new Map(
                fixtures.rows.map((fixture) => [fixture.status, fixture.id]),
            );

            await pool.query(`
                INSERT INTO rubbers (
                    fixture_id,
                    external_id,
                    home_player_1_id,
                    away_player_1_id,
                    home_games_won,
                    away_games_won,
                    outcome_type,
                    is_doubles
                )
                VALUES
                    ($1, 'rating-completed', $4, $5, 3, 1, 'normal', false),
                    ($2, 'rating-upcoming', $4, $5, 3, 1, 'normal', false),
                    ($3, 'rating-postponed', $4, $5, 3, 1, 'normal', false),
                    ($2, 'rating-upcoming-doubles', $4, $5, 3, 1, 'normal', true)
            `, [
                fixtureByStatus.get('completed'),
                fixtureByStatus.get('upcoming'),
                fixtureByStatus.get('postponed'),
                players.rows[0].id,
                players.rows[1].id,
            ]);

            await pool.query(`
                INSERT INTO rating_processing_state (
                    model_id,
                    last_processed_date,
                    status,
                    dirty_from_date
                )
                SELECT id, '2026-12-31', 'idle', NULL
                FROM rating_models
                WHERE key = 'global-singles-glicko2-v1'
                ON CONFLICT (model_id) DO UPDATE SET
                    last_processed_date = EXCLUDED.last_processed_date,
                    status = EXCLUDED.status,
                    dirty_from_date = NULL
            `);

            const migrationUp = spawnSync(
                'pnpm',
                ['exec', 'tsx', 'src/migrate.ts'],
                {
                    cwd: packageDirectory,
                    env: {
                        ...process.env,
                        DATABASE_URL: TEST_DATABASE_URL,
                    },
                    encoding: 'utf8',
                    timeout: 120_000,
                },
            );
            expect(
                migrationUp.status,
                `Migration reapply failed.\nstdout:\n${migrationUp.stdout}\nstderr:\n${migrationUp.stderr}`,
            ).toBe(0);

            const classified = await pool.query<{
                external_id: string;
                eligibility_reason: string;
            }>(`
                SELECT rubber.external_id, classification.eligibility_reason
                FROM rating_rubber_classification classification
                JOIN rubbers rubber ON rubber.id = classification.rubber_id
                WHERE rubber.external_id LIKE 'rating-%'
                ORDER BY rubber.external_id
            `);

            expect(classified.rows).toEqual([
                { external_id: 'rating-completed', eligibility_reason: 'eligible' },
                { external_id: 'rating-postponed', eligibility_reason: 'fixture_not_completed' },
                { external_id: 'rating-upcoming', eligibility_reason: 'fixture_not_completed' },
                { external_id: 'rating-upcoming-doubles', eligibility_reason: 'doubles' },
            ]);

            const migratedState = await pool.query<{
                dirty_from_date: string;
                status: string;
            }>(`
                SELECT dirty_from_date::text, status
                FROM rating_processing_state
                WHERE model_id = (
                    SELECT id
                    FROM rating_models
                    WHERE key = 'global-singles-glicko2-v1'
                )
            `);
            expect(migratedState.rows[0]).toEqual({
                dirty_from_date: '2026-01-11',
                status: 'dirty',
            });

            await pool.query(`
                UPDATE rating_processing_state
                SET status = 'idle',
                    dirty_from_date = NULL
                WHERE model_id = (
                    SELECT id
                    FROM rating_models
                    WHERE key = 'global-singles-glicko2-v1'
                )
            `);

            await pool.query(`
                UPDATE fixtures
                SET status = 'postponed',
                    updated_at = now()
                WHERE id = $1
            `, [fixtureByStatus.get('completed')]);

            const processingState = await pool.query<{
                dirty_from_date: string;
                status: string;
            }>(`
                SELECT dirty_from_date::text, status
                FROM rating_processing_state
                WHERE model_id = (
                    SELECT id
                    FROM rating_models
                    WHERE key = 'global-singles-glicko2-v1'
                )
            `);

            expect(processingState.rows[0]).toEqual({
                dirty_from_date: '2026-01-10',
                status: 'dirty',
            });
        } finally {
            await pool.end();
        }
    }, 120_000);
});
