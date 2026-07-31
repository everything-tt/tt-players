import { run, runMigrations } from 'graphile-worker';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { db } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { resolveAllScrapeTargets } from './all-scrape-targets.js';
import { runStartupRecovery } from './startup-recovery.js';
import { refreshApiReadModels } from './read-models.js';
import { setScheduledScrapeTargets, taskList } from './task-list.js';

const { Pool } = pg;

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
}

function envInteger(name: string, fallback: number, minimum = 0): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
    }
    return value;
}

const graphilePool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
    max: envInteger('GRAPHILE_POOL_MAX', 3, 2),
    statement_timeout: envInteger('GRAPHILE_STATEMENT_TIMEOUT_MS', 60_000),
    query_timeout: envInteger('GRAPHILE_QUERY_TIMEOUT_MS', 65_000),
    lock_timeout: envInteger('GRAPHILE_LOCK_TIMEOUT_MS', 5_000),
    idle_in_transaction_session_timeout: envInteger(
        'GRAPHILE_IDLE_TRANSACTION_TIMEOUT_MS',
        60_000,
    ),
    connectionTimeoutMillis: envInteger('GRAPHILE_CONNECTION_TIMEOUT_MS', 5_000),
    idleTimeoutMillis: envInteger('GRAPHILE_IDLE_TIMEOUT_MS', 10_000),
    application_name: process.env['GRAPHILE_APPLICATION_NAME'] || 'tt-players-worker-queue',
});

graphilePool.on('error', (error) => {
    console.error('Unexpected Graphile PostgreSQL pool error', error);
});

const CRONTAB = `
 0 2 * * * scheduleScrapeTasks ?fill=1d
 30 2 * * * scrapeSport80EventsTask ?fill=1d
 0 3 * * * scrapeSport80RankingsDiscoveryTask ?fill=1d
 30 3 * * * purgeExpiredCacheEntries ?fill=1d
 45 3 * * * reconcilePlayersTask ?fill=1d
 0 4 * * * calculateRatingsTask ?fill=1d
 30 4 * * * refreshApiReadModelsTask ?fill=1d
 `;

export async function startWorker(): Promise<void> {
    console.log('Bootstrapping configured and national sources...');
    const scrapeTargets: ScrapeTarget[] = await resolveAllScrapeTargets(db, {
        logger: {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
        },
    });
    setScheduledScrapeTargets(scrapeTargets);
    console.log(`${scrapeTargets.length} scrape targets resolved`);

    await runMigrations({ pgPool: graphilePool });
    await runStartupRecovery(db, (message) => console.log(message));
    await refreshApiReadModels(db, (message) => console.log(message));

    const runner = await run({
        pgPool: graphilePool,
        concurrency: envInteger('WORKER_CONCURRENCY', 1, 1),
        pollInterval: envInteger('WORKER_POLL_INTERVAL_MS', 5_000, 100),
        taskList,
        crontab: CRONTAB,
        noHandleSignals: true,
    });

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Worker received ${signal}; stopping...`);

        try {
            await runner.stop();
            await graphilePool.end();
            await db.destroy();
            console.log('Worker shutdown complete');
        } catch (error) {
            console.error('Worker shutdown failed', error);
            process.exitCode = 1;
        }
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    console.log('Graphile Worker started. Waiting for jobs...');
}

const currentModulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = entryPath === currentModulePath;
if (isDirectRun && typeof require === 'undefined') {
    startWorker().catch(async (error) => {
        console.error('Worker failed to start:', error);
        await graphilePool.end().catch(() => undefined);
        await db.destroy().catch(() => undefined);
        process.exitCode = 1;
    });
}
