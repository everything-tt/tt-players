import 'dotenv/config';
import { createDb } from '@tt-players/db';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Configure it before starting the API.');
}

function envInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer.`);
    }
    return value;
}

export const db = createDb(DATABASE_URL, {
    maxConnections: envInteger('DB_POOL_MAX', 12),
    statementTimeoutMs: envInteger('DB_STATEMENT_TIMEOUT_MS', 10_000),
    queryTimeoutMs: envInteger('DB_QUERY_TIMEOUT_MS', 12_000),
    lockTimeoutMs: envInteger('DB_LOCK_TIMEOUT_MS', 1_000),
    idleInTransactionSessionTimeoutMs: envInteger(
        'DB_IDLE_TRANSACTION_TIMEOUT_MS',
        15_000,
    ),
    connectionTimeoutMs: envInteger('DB_CONNECTION_TIMEOUT_MS', 3_000),
    idleTimeoutMs: envInteger('DB_IDLE_TIMEOUT_MS', 10_000),
    applicationName: process.env['DB_APPLICATION_NAME'] || 'tt-players-api',
});
