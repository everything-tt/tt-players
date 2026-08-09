import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { discoverVettsTournaments } from '../vetts-discovery.js';

const VETTS_UPSTREAM_QUEUE = 'vetts-tournamentsoftware';

function maximumTournaments(): number {
    const value = Number(process.env['VETTS_DISCOVERY_LIMIT'] ?? 30);
    return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 30;
}

export const scrapeVettsTournamentsTask: Task = async (_payload, helpers) => {
    const discovery = await discoverVettsTournaments(db, {
        info: (message) => helpers.logger.info(message),
        warn: (message) => helpers.logger.warn(message),
    });
    const tournaments = discovery.tournaments.slice(0, maximumTournaments());

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
