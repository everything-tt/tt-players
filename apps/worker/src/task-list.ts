import type { ScrapeTarget } from './bootstrap.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from './job-policy.js';
import { scrapeUrlTask } from './tasks/scrapeUrlTask.js';
import { processLogTask } from './tasks/processLogTask.js';
import { scrapeMatchesTask } from './tasks/scrapeMatchesTask.js';
import { scrapeMatchSetsBatchTask } from './tasks/scrapeMatchSetsBatchTask.js';
import { processMatchSetsBatchTask } from './tasks/processMatchSetsBatchTask.js';
import { reconcilePlayersTask } from './tasks/reconcilePlayersTask.js';
import { scrapeSport80EventsTask } from './tasks/scrapeSport80EventsTask.js';
import { scrapeSport80EventResultsTask } from './tasks/scrapeSport80EventResultsTask.js';
import { scrapeSport80RankingsDiscoveryTask } from './tasks/scrapeSport80RankingsDiscoveryTask.js';
import { scrapeSport80RankingTableTask } from './tasks/scrapeSport80RankingTableTask.js';
import { scrapeTteCalendarEventsTask } from './tasks/scrapeTteCalendarEventsTask.js';
import { scrapeVettsTournamentsTask } from './tasks/scrapeVettsTournamentsTask.js';
import { scrapeVettsTournamentTask } from './tasks/scrapeVettsTournamentTask.js';
import { calculateRatingsTask } from './tasks/calculateRatingsTask.js';
import { refreshApiReadModelsTask } from './tasks/refreshApiReadModelsTask.js';
import { completeDailyPipelineTask } from './tasks/completeDailyPipelineTask.js';
import { processManualTournamentSubmissionTask } from './tasks/processManualTournamentSubmissionTask.js';

let scheduledScrapeTargets: ScrapeTarget[] = [];

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
        }, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: stableJobKey('scrape-standings', target.competitionId, target.url),
        });
        helpers.logger.info(`  → Queued standings: ${target.leagueName} - ${target.divisionName}`);

        if (target.platformType === 'tt365' && target.fixturesUrl) {
            await helpers.addJob('scrapeUrlTask', {
                url: target.fixturesUrl,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
                tt365DataType: 'fixtures',
            }, {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('scrape-fixtures', target.competitionId, target.fixturesUrl),
            });
            helpers.logger.info(`  → Queued fixtures:  ${target.leagueName} - ${target.divisionName}`);
        }

        if (target.platformType === 'ttleagues' && target.divisionExtId) {
            await helpers.addJob('scrapeMatchesTask', {
                divisionId: target.divisionExtId,
                tenantHost: target.tenantHost,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
            }, {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey(
                    'scrape-matches',
                    target.competitionId,
                    target.divisionExtId,
                ),
            });
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
    scrapeMatchSetsBatchTask,
    processMatchSetsBatchTask,
    reconcilePlayersTask,
    scrapeSport80EventsTask,
    scrapeSport80EventResultsTask,
    scrapeSport80RankingsDiscoveryTask,
    scrapeSport80RankingTableTask,
    scrapeTteCalendarEventsTask,
    scrapeVettsTournamentsTask,
    scrapeVettsTournamentTask,
    calculateRatingsTask,
    refreshApiReadModelsTask,
    completeDailyPipelineTask,
    processManualTournamentSubmissionTask,
    scheduleScrapeTasks,
    purgeExpiredCacheEntries,
};
