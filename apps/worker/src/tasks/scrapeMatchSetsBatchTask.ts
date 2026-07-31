import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { storeScrapePayload } from '../extractor.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { SetsResponseSchema, type Match } from '../zod-schemas.js';

export interface ScrapeMatchSetsBatchPayload {
    divisionId: string;
    tenantHost: string;
    platformId: string;
    competitionId: string;
    matches: Match[];
}

const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const TTL_SETS_FETCH_TIMEOUT_MS = Number(
    process.env['TTL_SETS_FETCH_TIMEOUT_MS'] ?? '12000',
);
const TTL_SETS_FETCH_DELAY_MS = Number(
    process.env['TTL_SETS_FETCH_DELAY_MS'] ?? '250',
);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
    headers: Record<string, string>,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal, headers });
    } finally {
        clearTimeout(timeout);
    }
}

export const scrapeMatchSetsBatchTask: Task = async (payload, helpers) => {
    const {
        divisionId,
        tenantHost,
        platformId,
        competitionId,
        matches,
    } = payload as ScrapeMatchSetsBatchPayload;

    if (!tenantHost) {
        throw new Error(`scrapeMatchSetsBatchTask: missing tenantHost for division ${divisionId}`);
    }
    if (!Array.isArray(matches) || matches.length === 0) {
        helpers.logger.info('scrapeMatchSetsBatchTask: empty batch, skipping');
        return;
    }

    const headers = { Tenant: tenantHost, Entry: '1' };
    const sets: Record<string, unknown> = {};

    for (const [index, match] of matches.entries()) {
        const url = `${TTL_API_BASE}/matches/${match.id}/sets`;
        const response = await fetchWithTimeout(url, TTL_SETS_FETCH_TIMEOUT_MS, headers);

        if (response.status === 404) {
            helpers.logger.info(`scrapeMatchSetsBatchTask: no sets found for match ${match.id}`);
            continue;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${url}`);
        }

        sets[String(match.id)] = SetsResponseSchema.parse(await response.json());
        if (index < matches.length - 1 && TTL_SETS_FETCH_DELAY_MS > 0) {
            await sleep(TTL_SETS_FETCH_DELAY_MS);
        }
    }

    const body = JSON.stringify({
        standings: [],
        matches: { groups: [], matches },
        sets,
    });
    const batchKey = stableJobKey('ttleagues-set-payload', ...matches.map((match) => match.id));
    const logId = await storeScrapePayload(
        `${TTL_API_BASE}/divisions/${divisionId}/matches?${batchKey}`,
        platformId,
        body,
        db,
    );

    helpers.logger.info(
        `scrapeMatchSetsBatchTask: stored ${Object.keys(sets).length} match results in log ${logId}`,
    );
    await helpers.addJob('processMatchSetsBatchTask', {
        logId,
        competitionId,
        platformId,
    }, {
        ...RETRYABLE_JOB_SPEC,
        jobKey: stableJobKey('process-match-sets-batch', logId),
    });
};
