import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import {
    pruneRawScrapeLogs,
    rawScrapeRetentionPolicy,
} from '../raw-scrape-retention.js';

export const pruneRawScrapeLogsTask: Task = async (_payload, helpers) => {
    const policy = rawScrapeRetentionPolicy();
    const deleted = await pruneRawScrapeLogs(db, new Date(), policy);
    helpers.logger.info(
        `pruneRawScrapeLogsTask: deleted ${deleted} raw scrape payloads `
        + `(processed=${policy.processedDays}d, failed=${policy.failedDays}d, batch=${policy.batchSize})`,
    );
};
