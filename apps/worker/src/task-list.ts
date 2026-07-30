import type { ScrapeTarget } from './bootstrap.js';
import { scrapeUrlTask } from './tasks/scrapeUrlTask.js';
import { processLogTask } from './tasks/processLogTask.js';
import { scrapeMatchesTask } from './tasks/scrapeMatchesTask.js';
import { scrapeSport80EventsTask } from './tasks/scrapeSport80EventsTask.js';
import { scrapeSport80EventResultsTask } from './tasks/scrapeSport80EventResultsTask.js';
import { scrapeSport80RankingsDiscoveryTask } from './tasks/scrapeSport80RankingsDiscoveryTask.js';
import { scrapeSport80RankingTableTask } from './tasks/scrapeSport80RankingTableTask.js';
import { calculateRatingsTask } from './tasks/calculateRatingsTask.js';

let scheduledScrapeTargets: ScrapeTarget[] = [];

const SCRAPE_JOB_SPEC = { maxAttempts: 1 };

export function setScheduledScrapeTargets(targets: ScrapeTarget[]): void {
    scheduledScrapeTargets = targets;
}

const scheduleScrapeTasks = async (
    _payload: unknown,
    helpers: { addJob: Function; logger: { info: (msg: string) => void } },
) => {
    const activeTargets = scheduledScrapeTargets.filter((target) => !target.isHistorical);
    const historicalCount = scheduledScrapeTargets.length - activeTargets.length;
    helpers.logger.info(
        `scheduleScrapeTasks: queuing ${activeTargets.length} active targets (skipping ${historicalCount} historical targets)`,
    );

    for (const target of activeTargets) {
        await helpers.addJob('scrapeUrlTask', {
            url: target.url,
            tenantHost: target.tenantHost,
            platformId: target.platformId,
            platformType: target.platformType,
            competitionId: target.competitionId,
            tt365DataType: target.platformType === 'tt365' ? 'standings' : undefined,
        }, SCRAPE_JOB_SPEC);
        helpers.logger.info(`  → Queued standings: ${target.leagueName} - ${target.divisionName}`);

        if (target.platformType === 'tt365' && target.fixturesUrl) {
            await helpers.addJob('scrapeUrlTask', {
                url: target.fixturesUrl,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
                tt365DataType: 'fixtures',
            }, SCRAPE_JOB_SPEC);
            helpers.logger.info(`  → Queued fixtures:  ${target.leagueName} - ${target.divisionName}`);
        }

        if (target.platformType === 'ttleagues' && target.divisionExtId) {
            await helpers.addJob('scrapeMatchesTask', {
                divisionId: target.divisionExtId,
                tenantHost: target.tenantHost,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
            }, SCRAPE_JOB_SPEC);
            helpers.logger.info(`  → Queued matches:   ${target.leagueName} - ${target.divisionName}`);
        }
    }
};

const purgeExpiredCacheEntries = async (
    _payload: unknown,
    helpers: {
        query: <T extends { [column: string]: any }>(queryText: string, values?: unknown[]) => Promise<{ rows: T[] }>;
        logger: { info: (msg: string) => void };
    },
) => {
    const batchSize = 1000;
    let totalDeleted = 0;

    for (;;) {
        const result = await helpers.query<{ deleted_count: number }>(`
            WITH expired AS (
                SELECT id
                FROM cache_entries
                WHERE expires_at < now()
                ORDER BY expires_at ASC
                LIMIT $1
            ),
            deleted AS (
                DELETE FROM cache_entries ce
                USING expired
                WHERE ce.id = expired.id
                RETURNING 1
            )
            SELECT COUNT(*)::int AS deleted_count
            FROM deleted
        `, [batchSize]);

        const deletedCount = Number(result.rows[0]?.deleted_count ?? 0);
        totalDeleted += deletedCount;

        if (deletedCount < batchSize) {
            break;
        }
    }

    helpers.logger.info(`purgeExpiredCacheEntries: deleted ${totalDeleted} expired cache entries`);
};

export const taskList = {
    scrapeUrlTask,
    processLogTask,
    scrapeMatchesTask,
    scrapeSport80EventsTask,
    scrapeSport80EventResultsTask,
    scrapeSport80RankingsDiscoveryTask,
    scrapeSport80RankingTableTask,
    calculateRatingsTask,
    scheduleScrapeTasks,
    purgeExpiredCacheEntries,
};
