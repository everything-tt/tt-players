import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { VETTS_ADAPTER_KEY, VETTS_ADAPTER_VERSION } from '../vetts-adapter.js';
import { fetchVettsDiscovery, vettsDiscoveryYears, vettsUrls } from '../vetts-client.js';
import { parseVettsTournamentLinks, type VettsTournamentLink } from '../vetts-parser.js';
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
        adapterKey: VETTS_ADAPTER_KEY,
        config: {
            organisation: 'VETTS',
            calendarBaseUrl: 'https://www.vetts.org.uk',
        },
    });

    const discovered = new Map<string, VettsTournamentLink>();
    const failures: Error[] = [];

    for (const year of vettsDiscoveryYears()) {
        const discoveryUrl = vettsUrls.discovery(year);
        const resource = await upsertSourceResource(db, {
            sourceInstanceId: instance.id,
            resourceType: 'directory',
            externalId: `calendar-${year}`,
            adapterVersion: VETTS_ADAPTER_VERSION,
            name: `VETTS ${year} tournament calendar`,
            publicUrl: discoveryUrl,
            refreshPolicy: { cadence: 'weekly' },
        });

        try {
            const html = await fetchVettsDiscovery(year);
            const tournaments = parseVettsTournamentLinks(html, discoveryUrl);
            if (tournaments.length === 0) {
                throw new Error(`No VETTS tournaments discovered for ${year}; refusing to treat the calendar as empty`);
            }
            for (const tournament of tournaments) {
                discovered.set(tournament.tournamentId, tournament);
            }
            await recordSourceResourceSuccess(db, resource.id);
            helpers.logger.info(
                `scrapeVettsTournamentsTask: discovered ${tournaments.length} tournaments for ${year}`,
            );
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            await recordSourceResourceFailure(db, resource.id, failure);
            failures.push(failure);
        }
    }

    const tournaments = [...discovered.values()].slice(0, maximumTournaments());
    if (tournaments.length === 0) {
        throw new AggregateError(failures, 'No usable VETTS tournaments discovered');
    }

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
    helpers.logger.info(`scrapeVettsTournamentsTask: queued ${tournaments.length} tournaments`);

    if (failures.length > 0) {
        throw new AggregateError(failures, 'One or more VETTS calendar pages failed');
    }
};
