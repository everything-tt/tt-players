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
});
