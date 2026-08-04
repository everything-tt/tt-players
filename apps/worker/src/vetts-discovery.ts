import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { storeScrapePayload } from './extractor.js';
import {
    VETTS_ADAPTER_KEY,
    VETTS_ADAPTER_VERSION,
    vettsSourceAdapter,
} from './vetts-adapter.js';
import { vettsDiscoveryYears, vettsUrls } from './vetts-client.js';
import { upsertVettsPlatform } from './vetts-loader.js';
import type { VettsTournamentLink } from './vetts-parser.js';
import {
    recordSourceResourceFailure,
    recordSourceResourceSuccess,
    upsertSourceInstance,
    upsertSourceResource,
} from './sources/registry.js';
import type { SourceAdapterContext } from './sources/adapter.js';

export interface VettsDiscoveryLogger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface VettsDiscoveryResult {
    tournaments: VettsTournamentLink[];
    failures: Error[];
}

export async function discoverVettsTournaments(
    database: Kysely<Database>,
    logger: VettsDiscoveryLogger = {},
    years: number[] = vettsDiscoveryYears(),
): Promise<VettsDiscoveryResult> {
    const platformId = await upsertVettsPlatform(database);
    const instance = await upsertSourceInstance(database, {
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

    for (const year of years) {
        const discoveryUrl = vettsUrls.discovery(year);
        const resource = await upsertSourceResource(database, {
            sourceInstanceId: instance.id,
            resourceType: 'directory',
            externalId: `calendar-${year}`,
            adapterVersion: VETTS_ADAPTER_VERSION,
            name: `VETTS ${year} tournament calendar`,
            publicUrl: discoveryUrl,
            refreshPolicy: { cadence: 'weekly' },
        });
        const context: SourceAdapterContext = {
            sourceInstanceId: instance.id,
            sourceResourceId: resource.id,
            resourceType: 'directory',
            externalId: `calendar-${year}`,
            url: discoveryUrl,
            config: { year },
        };
        let rawLogId: string | null = null;

        try {
            const html = await vettsSourceAdapter.extract(context);
            rawLogId = await storeScrapePayload(discoveryUrl, platformId, html, database);
            const transformed = await vettsSourceAdapter.transform(html, context);
            if (!Array.isArray(transformed) || transformed.length === 0) {
                throw new Error(
                    `No VETTS tournaments discovered for ${year}; refusing to treat the calendar as empty`,
                );
            }

            for (const tournament of transformed) {
                discovered.set(tournament.tournamentId, tournament);
            }
            await database
                .updateTable('staging.raw_scrape_logs')
                .set({ status: 'processed' })
                .where('id', '=', rawLogId)
                .execute();
            await recordSourceResourceSuccess(database, resource.id);
            logger.info?.(`VETTS discovery: ${transformed.length} tournaments for ${year}`);
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            if (rawLogId) {
                await database
                    .updateTable('staging.raw_scrape_logs')
                    .set({ status: 'failed' })
                    .where('id', '=', rawLogId)
                    .execute();
            }
            await recordSourceResourceFailure(database, resource.id, failure);
            failures.push(failure);
            logger.warn?.(`VETTS discovery ${year}: ${failure.message}`);
        }
    }

    return {
        tournaments: [...discovered.values()],
        failures,
    };
}
