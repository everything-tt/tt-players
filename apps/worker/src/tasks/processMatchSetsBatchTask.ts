import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { loadTTLeaguesData } from '../loader.js';
import { parseTTLeaguesData } from '../parser.js';

export interface ProcessMatchSetsBatchPayload {
    logId: string;
    competitionId: string;
    platformId: string;
}

export const processMatchSetsBatchTask: Task = async (payload, helpers) => {
    const { logId, competitionId, platformId } = payload as ProcessMatchSetsBatchPayload;
    const log = await db
        .selectFrom('staging.raw_scrape_logs')
        .select(['raw_payload', 'status'])
        .where('id', '=', logId)
        .executeTakeFirst();

    if (!log) {
        throw new Error(`processMatchSetsBatchTask: scrape log ${logId} not found`);
    }
    if (log.status === 'processed') {
        helpers.logger.info(`processMatchSetsBatchTask: log ${logId} already processed`);
        return;
    }

    const raw = JSON.parse(log.raw_payload) as {
        standings: unknown;
        matches: unknown;
        sets: Record<string, unknown>;
    };
    const parsedData = parseTTLeaguesData(raw);
    await loadTTLeaguesData(db, {
        competitionId,
        platformId,
        parsedData,
        scrapeLogIds: [logId],
    });

    helpers.logger.info(
        `processMatchSetsBatchTask: loaded ${parsedData.fixtures.length} fixtures and ${parsedData.rubbers.length} rubbers`,
    );
};
