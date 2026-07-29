import { run, runMigrations } from 'graphile-worker';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { bootstrap, type ScrapeTarget } from './bootstrap.js';
import { runStartupRecovery } from './startup-recovery.js';
import { setScheduledScrapeTargets, taskList } from './task-list.js';

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
}

/**
 * Cron schedule (UTC):
 * Queue scheduleScrapeTasks every day at 2:00 AM.
 * Backfill up to 1 day of missed jobs.
 */
const CRONTAB = `
0 2 * * * scheduleScrapeTasks ?fill=1d
30 2 * * * scrapeSport80EventsTask ?fill=1d
0 3 * * * scrapeSport80RankingsDiscoveryTask ?fill=1d
30 3 * * * purgeExpiredCacheEntries ?fill=1d
0 4 * * * calculateRatingsTask ?fill=1d
`;

/**
 * Starts the Graphile Worker runner.
 *
 * 1. Bootstraps DB records from leagues.json (idempotent)
 * 2. Starts the Graphile Worker with cron scheduling
 */
export async function startWorker(): Promise<void> {
    // Bootstrap: ensure Platform/League/Season/Competition rows exist
    console.log('🔧 Bootstrapping from leagues.json...');
    const scrapeTargets: ScrapeTarget[] = await bootstrap(db);
    setScheduledScrapeTargets(scrapeTargets);
    console.log(`  ✅ ${scrapeTargets.length} scrape targets resolved\n`);

    // List them
    for (const t of scrapeTargets) {
        console.log(`  📋 ${t.leagueName} - ${t.divisionName}`);
    }
    console.log('');

    // Run graphile-worker schema migrations
    await runMigrations({
        connectionString: DATABASE_URL,
    });
    await runStartupRecovery(db, (message) => console.log(message));

    const runner = await run({
        connectionString: DATABASE_URL,
        concurrency: 1,
        pollInterval: 5000,
        taskList,
        crontab: CRONTAB,
    });

    // Graceful shutdown on signals
    const shutdown = async () => {
        await runner.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('Graphile Worker started. Waiting for jobs...');
}

// Auto-start when run directly
const currentModulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = entryPath === currentModulePath;
if (isDirectRun && typeof require === 'undefined') {
    // ESM direct execution
    startWorker().catch((err) => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
}
