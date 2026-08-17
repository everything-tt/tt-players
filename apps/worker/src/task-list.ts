import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from './job-policy.js';
import {
    addTrackedScrapeJob,
    dailyScrapeRunKey,
    ensureScrapeRun,
    runTrackedScrapeResource,
    trackScrapeTask,
    type ScrapeRunContext,
} from './scrape-run.js';
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

interface ScheduleScrapeTasksPayload {
    scrapeRun?: ScrapeRunContext;
}

const scheduleScrapeTasks: Task = async (_payload, helpers) => {
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

function rootContext(
    runKey: string,
    resourceKey: string,
    source: string,
    resourceType: string,
): ScrapeRunContext {
    return { runKey, resourceKey, source, resourceType };
}

const scheduleDailyScrapeRunTask: Task = async (_payload, helpers) => {
    const runKey = dailyScrapeRunKey(helpers.job.created_at);
    await ensureScrapeRun(db, runKey);
    const scheduler = rootContext(runKey, 'scheduler:daily', 'framework', 'daily-scheduler');

    await runTrackedScrapeResource(db, scheduler, helpers.job, async () => {
        await addTrackedScrapeJob(
            db,
            helpers,
            scheduler,
            'scheduleScrapeTasks',
            {} satisfies ScheduleScrapeTasksPayload,
            {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('schedule-scrape-targets', runKey),
            },
        );

        await addTrackedScrapeJob(
            db,
            helpers,
            rootContext(runKey, 'scheduler:sport80-events', 'sport80', 'scheduler'),
            'scrapeSport80EventsTask',
            {},
            {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('sport80-events-root', runKey),
                runAt: new Date(`${runKey}T02:30:00.000Z`),
            },
        );

        await addTrackedScrapeJob(
            db,
            helpers,
            rootContext(runKey, 'scheduler:sport80-rankings', 'sport80', 'scheduler'),
            'scrapeSport80RankingsDiscoveryTask',
            {},
            {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('sport80-rankings-root', runKey),
                runAt: new Date(`${runKey}T03:00:00.000Z`),
            },
        );
    });
};

const scheduleWeeklyVettsScrapeRunTask: Task = async (_payload, helpers) => {
    const runKey = dailyScrapeRunKey(helpers.job.created_at);
    await ensureScrapeRun(db, runKey);
    const scheduler = rootContext(runKey, 'scheduler:vetts-weekly', 'vetts', 'weekly-scheduler');

    await runTrackedScrapeResource(db, scheduler, helpers.job, async () => {
        await addTrackedScrapeJob(
            db,
            helpers,
            scheduler,
            'scrapeVettsTournamentsTask',
            {},
            {
                ...RETRYABLE_JOB_SPEC,
                queueName: 'vetts-tournamentsoftware',
                jobKey: stableJobKey('vetts-weekly-root', runKey),
            },
        );
    });
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

const trackedProcessLogTask = trackScrapeTask(db, processLogTask, {
    resolveOutcome: async (payload, childJobsRegistered) => {
        const logId = (payload as { logId?: string }).logId;
        if (!logId) return 'failed';
        const row = await db
            .selectFrom('staging.raw_scrape_logs')
            .select('status')
            .where('id', '=', logId)
            .executeTakeFirst();
        if (row?.status === 'failed') return 'failed';
        if (row?.status === 'pending' && childJobsRegistered === 0) return 'pending';
        return 'succeeded';
    },
});

export const taskList = {
    scrapeUrlTask: trackScrapeTask(db, scrapeUrlTask),
    processLogTask: trackedProcessLogTask,
    scrapeMatchesTask: trackScrapeTask(db, scrapeMatchesTask),
    scrapeMatchSetsBatchTask,
    processMatchSetsBatchTask: trackScrapeTask(db, processMatchSetsBatchTask),
    reconcilePlayersTask,
    scrapeSport80EventsTask: trackScrapeTask(db, scrapeSport80EventsTask),
    scrapeSport80EventResultsTask: trackScrapeTask(db, scrapeSport80EventResultsTask),
    scrapeSport80RankingsDiscoveryTask: trackScrapeTask(db, scrapeSport80RankingsDiscoveryTask),
    scrapeSport80RankingTableTask: trackScrapeTask(db, scrapeSport80RankingTableTask),
    scrapeTteCalendarEventsTask: trackScrapeTask(db, scrapeTteCalendarEventsTask),
    scrapeVettsTournamentsTask: trackScrapeTask(db, scrapeVettsTournamentsTask),
    scrapeVettsTournamentTask: trackScrapeTask(db, scrapeVettsTournamentTask),
    calculateRatingsTask,
    refreshApiReadModelsTask,
    completeDailyPipelineTask,
    processManualTournamentSubmissionTask,
    scheduleScrapeTasks: trackScrapeTask(db, scheduleScrapeTasks),
    scheduleDailyScrapeRunTask,
    scheduleWeeklyVettsScrapeRunTask,
    purgeExpiredCacheEntries,
};
