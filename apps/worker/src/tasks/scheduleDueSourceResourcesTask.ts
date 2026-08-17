import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { enqueueDueSourceResources } from '../source-resource-scheduler.js';
import {
    addTrackedScrapeJob,
    dailyScrapeRunKey,
    ensureScrapeRun,
    runTrackedScrapeResource,
    type ScrapeRunContext,
} from '../scrape-run.js';

function schedulerContext(runKey: string): ScrapeRunContext {
    return {
        runKey,
        resourceKey: 'scheduler:persisted-resources',
        source: 'framework',
        resourceType: 'persisted-source-scheduler',
    };
}

export const scheduleDueSourceResourcesTask: Task = async (_payload, helpers) => {
    const runKey = dailyScrapeRunKey(helpers.job.created_at);
    await ensureScrapeRun(db, runKey);
    const context = schedulerContext(runKey);

    await runTrackedScrapeResource(db, context, helpers.job, async () => {
        const summary = await enqueueDueSourceResources(
            db,
            (identifier, payload, spec) => addTrackedScrapeJob(
                db,
                helpers,
                context,
                identifier,
                payload,
                spec,
            ),
        );
        helpers.logger.info(
            `scheduleDueSourceResourcesTask: scanned=${summary.scanned} due=${summary.due} `
            + `queued=${summary.queued} unsupported=${summary.unsupported}`,
        );
    });
};
