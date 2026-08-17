import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { resolveAllScrapeTargets } from '../all-scrape-targets.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';

export const refreshScrapeTargetsTask: Task = async (_payload, helpers) => {
    const targets = await resolveAllScrapeTargets(db, {
        logger: {
            info: (message) => helpers.logger.info(message),
            warn: (message) => helpers.logger.warn(message),
        },
        // Discovery is a required daily resource. Keeping a stale registry is
        // useful for resilience, but publication must not claim a complete run
        // when required national discovery failed.
        throwOnNationalError: true,
    });

    helpers.logger.info(
        `refreshScrapeTargetsTask: ${targets.length} enabled persisted scrape targets`,
    );
    await helpers.addJob('scheduleScrapeTasks', {}, {
        ...RETRYABLE_JOB_SPEC,
        jobKey: stableJobKey('schedule-scrape-targets'),
    });
};
