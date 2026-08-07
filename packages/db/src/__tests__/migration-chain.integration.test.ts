import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

const TEST_DATABASE_NAME = 'tt_players_migration_chain_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DATABASE_NAME}`;
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
});
