import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { chunkItems } from '../batches.js';
import { storeScrapePayload } from '../extractor.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { MatchesResponseSchema } from '../zod-schemas.js';

export interface ScrapeMatchesPayload {
    divisionId: string;
    tenantHost?: string | null;
    platformId: string;
    platformType: 'ttleagues';
    competitionId: string;
}

const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const TTL_RECHECK_COMPLETED_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_MATCHES_FETCH_TIMEOUT_MS = Number(
    process.env['TTL_MATCHES_FETCH_TIMEOUT_MS'] ?? '15000',
);
const TTL_SET_BATCH_SIZE = Number(
    process.env['TTL_SET_BATCH_SIZE'] ?? '20',
);

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

export const scrapeMatchesTask: Task = async (payload, helpers) => {
    const { divisionId, tenantHost, platformId, competitionId } = payload as ScrapeMatchesPayload;
    if (!tenantHost) {
        throw new Error(`scrapeMatchesTask: missing tenantHost for division ${divisionId}`);
    }

    const matchesUrl = `${TTL_API_BASE}/divisions/${divisionId}/matches`;
    const headers = { Tenant: tenantHost, Entry: '1' };
    helpers.logger.info(`scrapeMatchesTask: fetching ${matchesUrl}`);

    const response = await fetchWithTimeout(matchesUrl, TTL_MATCHES_FETCH_TIMEOUT_MS, headers);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${matchesUrl}`);
    }

    const matchesData = MatchesResponseSchema.parse(await response.json());
    const snapshotBody = JSON.stringify({
        standings: [],
        matches: matchesData,
        sets: {},
    });
    const snapshotLogId = await storeScrapePayload(
        `${matchesUrl}?snapshot=fixtures`,
        platformId,
        snapshotBody,
        db,
    );

    await helpers.addJob('processLogTask', {
        logId: snapshotLogId,
        competitionId,
        platformId,
        platformType: 'ttleagues-bundle',
    }, {
        ...RETRYABLE_JOB_SPEC,
        jobKey: stableJobKey('process-log', snapshotLogId),
    });

    const completedMatches = matchesData.matches.filter((match) => match.hasResults);
    const completedMatchIds = completedMatches.map((match) => String(match.id));
    const existingFixtures = completedMatchIds.length === 0
        ? []
        : await db
            .selectFrom('fixtures')
            .select(['external_id', 'status', 'updated_at'])
            .where('competition_id', '=', competitionId)
            .where('external_id', 'in', completedMatchIds)
            .execute();
    const existingFixtureMap = new Map(
        existingFixtures.map((fixture) => [fixture.external_id, fixture]),
    );

    const nowMs = Date.now();
    const matchesNeedingSets = completedMatches.filter((match) => {
        const fixture = existingFixtureMap.get(String(match.id));
        if (!fixture || fixture.status !== 'completed') return true;
        return nowMs - new Date(fixture.updated_at).getTime() >= TTL_RECHECK_COMPLETED_MS;
    });
    const batches = chunkItems(matchesNeedingSets, TTL_SET_BATCH_SIZE);

    helpers.logger.info(
        `scrapeMatchesTask: ${matchesData.matches.length} fixtures, ${matchesNeedingSets.length} result fetches in ${batches.length} batches`,
    );

    for (const batch of batches) {
        const matchIds = batch.map((match) => match.id);
        await helpers.addJob('scrapeMatchSetsBatchTask', {
            divisionId,
            tenantHost,
            platformId,
            competitionId,
            matches: batch,
        }, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: stableJobKey('ttleagues-set-batch', competitionId, ...matchIds),
        });
    }
};
