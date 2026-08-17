import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { stableJobKey } from '../job-policy.js';
import {
    pruneRawScrapeLogs,
    rawScrapeRetentionPolicy,
} from '../raw-scrape-retention.js';

const FOLLOW_UP_JOB_SPEC = {
    maxAttempts: 3,
    jobKeyMode: 'replace' as const,
    jobKey: stableJobKey('prune-raw-scrape-logs', 'follow-up'),
};

export const pruneRawScrapeLogsTask: Task = async (_payload, helpers) => {
    const policy = rawScrapeRetentionPolicy();
    const deleted = await pruneRawScrapeLogs(db, new Date(), policy);
    helpers.logger.info(
        `pruneRawScrapeLogsTask: deleted ${deleted} raw scrape payloads `
        + `(processed=${policy.processedDays}d, failed=${policy.failedDays}d, batch=${policy.batchSize})`,
    );

    // Each transaction stays bounded. If it filled the batch, queue another
    // bounded invocation so a large backlog drains without one long-running job.
    if (deleted === policy.batchSize) {
        await helpers.addJob('pruneRawScrapeLogsTask', {}, FOLLOW_UP_JOB_SPEC);
    }
};
