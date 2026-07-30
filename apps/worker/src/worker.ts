import { run, runMigrations } from 'graphile-worker';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { resolveAllScrapeTargets } from './all-scrape-targets.js';
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
 * 1. Bootstraps configured local leagues and national TT Leagues sources
 * 2. Starts the Graphile Worker with cron scheduling
 */
export async function startWorker(): Promise<void> {
    console.log('🔧 Bootstrapping configured and national sources...');
    const scrapeTargets: ScrapeTarget[] = await resolveAllScrapeTargets(db, {
        logger: {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
        },
    });
    setScheduledScrapeTargets(scrapeTargets);
    console.log(`  ✅ ${scrapeTargets.length} scrape targets resolved\n`);

    for (const target of scrapeTargets) {
        console.log(`  📋 ${target.leagueName} - ${target.divisionName}`);
    }
    console.log('');

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

    const shutdown = async () => {
        await runner.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('Graphile Worker started. Waiting for jobs...');
}

const currentModulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = entryPath === currentModulePath;
if (isDirectRun && typeof require === 'undefined') {
    startWorker().catch((error) => {
        console.error('Worker failed to start:', error);
        process.exit(1);
    });
}
