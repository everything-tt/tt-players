import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { createRequestFingerprint, storeScrapePayload } from '../extractor.js';
import { fetchWithTTLeaguesPolicy } from '../ttleagues-http.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import {
    addTrackedScrapeJob,
    beginScrapeRunResource,
    recordScrapeRunTaskFailure,
    scrapeRunContext,
    succeedScrapeRunResource,
    type ScrapeRunContext,
} from '../scrape-run.js';
import { SetsResponseSchema, type Match } from '../zod-schemas.js';

export interface ScrapeMatchSetPayload {
    divisionId: string;
    tenantHost: string;
    platformId: string;
    competitionId: string;
    match: Match;
    scrapeRun?: ScrapeRunContext;
}

interface LegacyScrapeMatchSetsBatchPayload {
    divisionId: string;
    tenantHost: string;
    platformId: string;
    competitionId: string;
    matches: Match[];
}

type TaskHelpers = Parameters<Task>[1];

const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const TTL_SETS_FETCH_TIMEOUT_MS = Number(
    process.env['TTL_SETS_FETCH_TIMEOUT_MS']
    ?? process.env['TTL_FETCH_TIMEOUT_MS']
    ?? '15000',
);
const TTL_SETS_FETCH_DELAY_MS = Number(
    process.env['TTL_SETS_FETCH_DELAY_MS'] ?? '250',
);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePayload(payload: unknown): {
    items: ScrapeMatchSetPayload[];
    graphileBatchPayload: boolean;
} {
    if (Array.isArray(payload)) {
        return {
            items: payload as ScrapeMatchSetPayload[],
            graphileBatchPayload: true,
        };
    }

    const legacy = payload as LegacyScrapeMatchSetsBatchPayload;
    if (Array.isArray(legacy?.matches)) {
        return {
            items: legacy.matches.map((match) => ({
                divisionId: legacy.divisionId,
                tenantHost: legacy.tenantHost,
                platformId: legacy.platformId,
                competitionId: legacy.competitionId,
                match,
            })),
            graphileBatchPayload: false,
        };
    }

    return {
        items: [payload as ScrapeMatchSetPayload],
        graphileBatchPayload: false,
    };
}

async function scrapeOneMatchResult(
    item: ScrapeMatchSetPayload,
    helpers: TaskHelpers,
): Promise<void> {
    const {
        divisionId,
        tenantHost,
        platformId,
        competitionId,
        match,
    } = item;
    const runContext = scrapeRunContext(item);

    if (runContext) await beginScrapeRunResource(db, runContext);

    try {
        if (!tenantHost) {
            throw new Error(`scrapeMatchSetsBatchTask: missing tenantHost for division ${divisionId}`);
        }
        if (!match) {
            throw new Error('scrapeMatchSetsBatchTask: missing match payload');
        }

        const headers = { Tenant: tenantHost, Entry: '1' };
        const url = `${TTL_API_BASE}/matches/${match.id}/sets`;
        const response = await fetchWithTTLeaguesPolicy(url, { headers }, {
            timeoutMs: TTL_SETS_FETCH_TIMEOUT_MS,
        });

        if (response.status === 404) {
            helpers.logger.info(`scrapeMatchSetsBatchTask: no sets found for match ${match.id}`);
            if (runContext) await succeedScrapeRunResource(db, runContext);
            return;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${url}`);
        }

        const parsedSets = SetsResponseSchema.parse(await response.json());
        const body = JSON.stringify({
            standings: [],
            matches: { groups: [], matches: [match] },
            sets: { [String(match.id)]: parsedSets },
        });
        const logId = await storeScrapePayload(url, platformId, body, db, {
            requestFingerprint: createRequestFingerprint(url, { headers }),
            httpStatus: response.status,
        });

        helpers.logger.info(
            `scrapeMatchSetsBatchTask: stored result for match ${match.id} in log ${logId}`,
        );
        if (runContext) {
            await addTrackedScrapeJob(db, helpers, runContext, 'processMatchSetsBatchTask', {
                logId,
                competitionId,
                platformId,
            }, {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('process-match-sets-batch', logId),
            });
            await succeedScrapeRunResource(db, runContext);
        } else {
            await helpers.addJob('processMatchSetsBatchTask', {
                logId,
                competitionId,
                platformId,
            }, {
                ...RETRYABLE_JOB_SPEC,
                jobKey: stableJobKey('process-match-sets-batch', logId),
            });
        }
    } catch (error) {
        if (runContext) {
            await recordScrapeRunTaskFailure(db, runContext, helpers.job, error);
        }
        throw error;
    }
}

function sequentialResultPromises(
    items: ScrapeMatchSetPayload[],
    helpers: TaskHelpers,
): Promise<void>[] {
    let sequence = Promise.resolve();

    return items.map((item, index) => {
        const operation = sequence.then(() => scrapeOneMatchResult(item, helpers));
        sequence = operation
            .catch(() => undefined)
            .then(async () => {
                if (index < items.length - 1 && TTL_SETS_FETCH_DELAY_MS > 0) {
                    await sleep(TTL_SETS_FETCH_DELAY_MS);
                }
            });
        return operation;
    });
}

export const scrapeMatchSetsBatchTask: Task = (payload, helpers) => {
    const { items, graphileBatchPayload } = normalizePayload(payload);
    if (items.length === 0) {
        helpers.logger.info('scrapeMatchSetsBatchTask: empty batch, skipping');
        return Promise.resolve();
    }

    const operations = sequentialResultPromises(items, helpers);

    return graphileBatchPayload
        ? operations
        : Promise.all(operations).then(() => undefined);
};
