import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { fetchVettsDiscovery, vettsUrls } from '../vetts-client.js';
import { parseVettsTournamentLinks } from '../vetts-parser.js';
import { upsertVettsPlatform } from '../vetts-loader.js';
import {
    recordSourceResourceFailure,
    recordSourceResourceSuccess,
    upsertSourceInstance,
    upsertSourceResource,
} from '../sources/registry.js';

function maximumTournaments(): number {
    const value = Number(process.env['VETTS_DISCOVERY_LIMIT'] ?? 30);
    return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 30;
}

export const scrapeVettsTournamentsTask: Task = async (_payload, helpers) => {
    const platformId = await upsertVettsPlatform(db);
    const instance = await upsertSourceInstance(db, {
        platformId,
        key: 'vetts',
        name: 'Veterans English Table Tennis Society',
        baseUrl: 'https://vetts.tournamentsoftware.com',
        adapterKey: 'tournamentsoftware-vetts',
        config: { organisation: 'VETTS' },
    });
    const resource = await upsertSourceResource(db, {
        sourceInstanceId: instance.id,
        resourceType: 'directory',
        externalId: 'completed-tournaments',
        adapterVersion: '1.0.0',
        name: 'VETTS completed tournaments',
        publicUrl: vettsUrls.discovery,
        refreshPolicy: { cadence: 'weekly' },
    });

    try {
        const html = await fetchVettsDiscovery();
        const tournaments = parseVettsTournamentLinks(html).slice(0, maximumTournaments());
        for (const tournament of tournaments) {
            await helpers.addJob(
                'scrapeVettsTournamentTask',
                { tournamentId: tournament.tournamentId },
                {
                    ...RETRYABLE_JOB_SPEC,
                    jobKey: stableJobKey('scrape-vetts-tournament', tournament.tournamentId),
                },
            );
        }
        await recordSourceResourceSuccess(db, resource.id);
        helpers.logger.info(`scrapeVettsTournamentsTask: queued ${tournaments.length} tournaments`);
    } catch (error) {
        await recordSourceResourceFailure(db, resource.id, error);
        throw error;
    }
};
