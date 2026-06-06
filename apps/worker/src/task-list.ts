import type { ScrapeTarget } from './bootstrap.js';
import { scrapeUrlTask } from './tasks/scrapeUrlTask.js';
import { processLogTask } from './tasks/processLogTask.js';
import { scrapeMatchesTask } from './tasks/scrapeMatchesTask.js';
import { scrapeSport80EventsTask } from './tasks/scrapeSport80EventsTask.js';
import { scrapeSport80EventResultsTask } from './tasks/scrapeSport80EventResultsTask.js';
import { scrapeSport80RankingsDiscoveryTask } from './tasks/scrapeSport80RankingsDiscoveryTask.js';
import { scrapeSport80RankingTableTask } from './tasks/scrapeSport80RankingTableTask.js';

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

export const taskList = {
    scrapeUrlTask,
    processLogTask,
    scrapeMatchesTask,
    scrapeSport80EventsTask,
    scrapeSport80EventResultsTask,
    scrapeSport80RankingsDiscoveryTask,
    scrapeSport80RankingTableTask,
    scheduleScrapeTasks,
};
