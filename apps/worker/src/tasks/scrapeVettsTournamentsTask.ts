import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { discoverVettsTournaments } from '../vetts-discovery.js';
import type { VettsTournamentLink } from '../vetts-parser.js';

const VETTS_UPSTREAM_QUEUE = 'vetts-tournamentsoftware';
const MAX_CONFIGURED_DISCOVERY_GUARD = 10_000;

export function vettsDiscoveryLimit(raw = process.env['VETTS_DISCOVERY_LIMIT']): number | null {
    if (raw === undefined || raw.trim() === '') return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0 || value > MAX_CONFIGURED_DISCOVERY_GUARD) {
        throw new Error(
            `VETTS_DISCOVERY_LIMIT must be a positive integer <= ${MAX_CONFIGURED_DISCOVERY_GUARD}`,
        );
    }
    return value;
}

export function completeVettsDiscovery(
    tournaments: readonly VettsTournamentLink[],
    limit: number | null = vettsDiscoveryLimit(),
): VettsTournamentLink[] {
    if (limit !== null && tournaments.length > limit) {
        throw new Error(
            `VETTS discovery incomplete: explicit VETTS_DISCOVERY_LIMIT=${limit} would truncate ${tournaments.length} discovered tournaments`,
        );
    }
    return [...tournaments];
}

export const scrapeVettsTournamentsTask: Task = async (_payload, helpers) => {
    const discovery = await discoverVettsTournaments(db, {
        info: (message) => helpers.logger.info(message),
        warn: (message) => helpers.logger.warn(message),
    });
    const tournaments = completeVettsDiscovery(discovery.tournaments);

    if (tournaments.length === 0) {
        throw new AggregateError(discovery.failures, 'No usable VETTS tournaments discovered');
    }

    for (const tournament of tournaments) {
        await helpers.addJob(
            'scrapeVettsTournamentTask',
            { tournamentId: tournament.tournamentId },
            {
                ...RETRYABLE_JOB_SPEC,
                queueName: VETTS_UPSTREAM_QUEUE,
                jobKey: stableJobKey('scrape-vetts-tournament', tournament.tournamentId),
            },
        );
    }
    helpers.logger.info(`scrapeVettsTournamentsTask: queued ${tournaments.length} tournaments`);

    if (discovery.failures.length > 0) {
        throw new AggregateError(discovery.failures, 'One or more VETTS calendar pages failed');
    }
};
