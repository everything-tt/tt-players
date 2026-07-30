import { FileMigrationProvider, type Kysely, sql } from 'kysely';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';

export function validateMigrationOrder(
    availableMigrations: string[],
    executedMigrations: string[],
): string[] {
    const migrations = availableMigrations.slice().sort((a, b) => a.localeCompare(b));

    for (const executed of executedMigrations) {
        if (!migrations.includes(executed)) {
            throw new Error(`corrupted migrations: previously executed migration ${executed} is missing`);
        }
    }

    for (let index = 0; index < executedMigrations.length; index++) {
        if (migrations[index] !== executedMigrations[index]) {
            throw new Error(
                `corrupted migrations: expected previously executed migration ${executedMigrations[index]} ` +
                `to be at index ${index} but ${migrations[index]} was found in its place. ` +
                'New migrations must always have a name that comes alphabetically after the last executed migration.',
            );
        }
    }

    return migrations.filter((migration) => !executedMigrations.includes(migration));
}

async function getExecutedMigrations(database: Kysely<any>): Promise<string[]> {
    const tableResult = await sql<{ exists: boolean }>`
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'kysely_migration'
        ) AS "exists"
    `.execute(database);

    if (!tableResult.rows[0]?.exists) {
        return [];
    }

    const executedResult = await sql<{ name: string }>`
        SELECT name
        FROM kysely_migration
        ORDER BY timestamp ASC, name ASC
    `.execute(database);

    return executedResult.rows.map((migration) => migration.name);
}

async function preflightMigrations(): Promise<void> {
    const { db } = await import('./database.js');
    const provider = new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(import.meta.dirname, 'migrations'),
    });

    try {
        const availableMigrations = Object.keys(await provider.getMigrations());
        const executedMigrations = await getExecutedMigrations(db);
        const pendingMigrations = validateMigrationOrder(availableMigrations, executedMigrations);
        console.log(`✅ Migration preflight passed (${pendingMigrations.length} pending)`);
    } catch (error) {
        console.error('❌ Migration preflight failed:', error);
        process.exitCode = 1;
    } finally {
        await db.destroy();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    preflightMigrations();
}
