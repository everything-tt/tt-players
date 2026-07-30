import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import dotenv from 'dotenv';
import type { Database } from './official-ranking-types.js';

const { Pool } = pg;

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
    throw new Error(
        'DATABASE_URL environment variable is not set. ' +
        'Copy .env.example to .env and configure your database connection.'
    );
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 10,
});
pool.on('connect', (client) => {
    client.query('SET search_path TO public, staging');
});

export const db = new Kysely<Database>({
    dialect: new PostgresDialect({
        pool,
    }),
});

export function createDb(connectionString: string): Kysely<Database> {
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
        max: 10,
    });
    pool.on('connect', (client) => {
        client.query('SET search_path TO public, staging');
    });
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool,
        }),
    });
}
