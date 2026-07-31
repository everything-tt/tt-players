import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import dotenv from 'dotenv';
import type { Database } from './identity-resolution-types.js';

const { Pool } = pg;

dotenv.config();

export interface DatabaseConnectionOptions {
    maxConnections?: number;
    statementTimeoutMs?: number;
    queryTimeoutMs?: number;
    lockTimeoutMs?: number;
    idleInTransactionSessionTimeoutMs?: number;
    connectionTimeoutMs?: number;
    idleTimeoutMs?: number;
    applicationName?: string;
}

function readNonNegativeInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer.`);
    }
    return value;
}

function optionsFromEnvironment(): DatabaseConnectionOptions {
    return {
        maxConnections: readNonNegativeInteger('DB_POOL_MAX', 10),
        statementTimeoutMs: readNonNegativeInteger('DB_STATEMENT_TIMEOUT_MS', 30_000),
        queryTimeoutMs: readNonNegativeInteger('DB_QUERY_TIMEOUT_MS', 35_000),
        lockTimeoutMs: readNonNegativeInteger('DB_LOCK_TIMEOUT_MS', 5_000),
        idleInTransactionSessionTimeoutMs: readNonNegativeInteger(
            'DB_IDLE_TRANSACTION_TIMEOUT_MS',
            60_000,
        ),
        connectionTimeoutMs: readNonNegativeInteger('DB_CONNECTION_TIMEOUT_MS', 5_000),
        idleTimeoutMs: readNonNegativeInteger('DB_IDLE_TIMEOUT_MS', 10_000),
        applicationName: process.env['DB_APPLICATION_NAME'] || 'tt-players',
    };
}

export function createDb(
    connectionString: string,
    options: DatabaseConnectionOptions = optionsFromEnvironment(),
): Kysely<Database> {
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require')
            ? { rejectUnauthorized: false }
            : undefined,
        max: options.maxConnections ?? 10,
        statement_timeout: options.statementTimeoutMs ?? 30_000,
        query_timeout: options.queryTimeoutMs ?? 35_000,
        lock_timeout: options.lockTimeoutMs ?? 5_000,
        idle_in_transaction_session_timeout:
            options.idleInTransactionSessionTimeoutMs ?? 60_000,
        connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
        idleTimeoutMillis: options.idleTimeoutMs ?? 10_000,
        application_name: options.applicationName ?? 'tt-players',
        options: '-c search_path=public,staging',
    });

    pool.on('error', (error) => {
        console.error('Unexpected PostgreSQL pool error', error);
    });

    return new Kysely<Database>({
        dialect: new PostgresDialect({ pool }),
    });
}

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
    throw new Error(
        'DATABASE_URL environment variable is not set. ' +
        'Configure the database connection before starting the service.',
    );
}

export const db = createDb(DATABASE_URL);
