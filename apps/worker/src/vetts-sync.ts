import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { storeScrapePayload } from './extractor.js';
import { loadTTLeaguesData } from './loader.js';
import {
    recordSourceResourceFailure,
    recordSourceResourceSuccess,
    upsertSourceInstance,
    upsertSourceResource,
} from './sources/registry.js';
import type { SourceAdapterContext } from './sources/adapter.js';
import {
    VETTS_ADAPTER_KEY,
    VETTS_ADAPTER_VERSION,
    vettsSourceAdapter,
} from './vetts-adapter.js';
import { vettsUrls } from './vetts-client.js';
import {
    enumerateTournamentDates,
    vettsMatchesToParsedData,
    type VettsMatchesPage,
    type VettsTournamentMetadata,
} from './vetts-parser.js';
import {
    deriveVettsEventStatus,
    deriveVettsRecordKind,
    isVettsCancelledTournament,
    resolveVettsCompetition,
    upsertVettsLeague,
    upsertVettsPlatform,
    upsertVettsResultRows,
    upsertVettsSeason,
    upsertVettsSourceEvent,
} from './vetts-loader.js';
import { reconcileVettsDuplicateRubbers } from './vetts-duplicate-reconciliation.js';

export interface VettsSyncLogger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface VettsSyncResult {
    tournamentId: string;
    competitionId: string;
    matchRows: number;
    rejectedRows: number;
    duplicateLinks: number;
    duplicateConflicts: number;
}

function asTournamentMetadata(
    value: VettsTournamentMetadata | VettsMatchesPage | unknown[],
): VettsTournamentMetadata {
    if (Array.isArray(value) || !('tournamentId' in value) || !('name' in value)) {
        throw new Error('VETTS event adapter returned an unexpected payload');
    }
    return value as VettsTournamentMetadata;
}

function asMatchesPage(
    value: VettsTournamentMetadata | VettsMatchesPage | unknown[],
): VettsMatchesPage {
    if (Array.isArray(value) || !('matches' in value) || !('issues' in value)) {
        throw new Error('VETTS result adapter returned an unexpected payload');
    }
    return value as VettsMatchesPage;
}

async function markRawLogFailed(
    database: Kysely<Database>,
    rawLogId: string,
): Promise<void> {
    await database
        .updateTable('staging.raw_scrape_logs')
        .set({ status: 'failed' })
        .where('id', '=', rawLogId)
        .execute();
}

export async function syncVettsTournament(
    database: Kysely<Database>,
    tournamentId: string,
    logger: VettsSyncLogger = {},
): Promise<VettsSyncResult> {
    const platformId = await upsertVettsPlatform(database);
    const sourceInstance = await upsertSourceInstance(database, {
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
    const overviewUrl = vettsUrls.tournament(tournamentId);
    let overviewResource = await upsertSourceResource(database, {
        sourceInstanceId: sourceInstance.id,
        resourceType: 'event',
        externalId: tournamentId,
        adapterVersion: VETTS_ADAPTER_VERSION,
        name: `VETTS tournament ${tournamentId}`,
        publicUrl: overviewUrl,
        refreshPolicy: { cadence: 'weekly-after-completion' },
    });
    let resultsResource = await upsertSourceResource(database, {
        sourceInstanceId: sourceInstance.id,
        resourceType: 'event-results',
        externalId: `${tournamentId}:matches`,
        adapterVersion: VETTS_ADAPTER_VERSION,
        name: `VETTS tournament results ${tournamentId}`,
        publicUrl: vettsUrls.matches(tournamentId),
        refreshPolicy: { cadence: 'daily-during-event-weekly-after' },
    });
    let activeResource: 'overview' | 'results' = 'overview';

    try {
        const overviewContext: SourceAdapterContext = {
            sourceInstanceId: sourceInstance.id,
            sourceResourceId: overviewResource.id,
            resourceType: 'event',
            externalId: tournamentId,
            url: overviewUrl,
            config: { tournamentId },
        };
        const overviewHtml = await vettsSourceAdapter.extract(overviewContext);
        const overviewLogId = await storeScrapePayload(
            overviewUrl,
            platformId,
            overviewHtml,
            database,
        );
        let metadata: VettsTournamentMetadata;
        try {
            metadata = asTournamentMetadata(
                await vettsSourceAdapter.transform(overviewHtml, overviewContext),
            );
            if (!metadata.startDate) {
                throw new Error(`VETTS event page did not contain a usable tournament start date for ${tournamentId}`);
            }
        } catch (error) {
            await markRawLogFailed(database, overviewLogId);
            throw error;
        }

        const leagueId = await upsertVettsLeague(database, platformId);
        const seasonId = await upsertVettsSeason(database, leagueId, metadata.startDate);
        const resolution = await resolveVettsCompetition(database as Kysely<any>, seasonId, metadata);
        const competitionId = resolution.competitionId;
        const sourceEventId = await upsertVettsSourceEvent(
            database as Kysely<any>,
            platformId,
            competitionId,
            metadata,
        );
        logger.info?.(
            `VETTS ${tournamentId}: resolved ${metadata.name} via ${resolution.matchMethod} to ${competitionId}`,
        );

        overviewResource = await upsertSourceResource(database, {
            sourceInstanceId: sourceInstance.id,
            resourceType: 'event',
            externalId: tournamentId,
            adapterVersion: VETTS_ADAPTER_VERSION,
            name: metadata.name,
            publicUrl: overviewUrl,
            refreshPolicy: { cadence: 'weekly-after-completion' },
            seasonId,
            competitionId,
        });
        resultsResource = await upsertSourceResource(database, {
            sourceInstanceId: sourceInstance.id,
            resourceType: 'event-results',
            externalId: `${tournamentId}:matches`,
            adapterVersion: VETTS_ADAPTER_VERSION,
            name: `${metadata.name} results`,
            publicUrl: vettsUrls.matches(tournamentId),
            refreshPolicy: { cadence: 'daily-during-event-weekly-after' },
            seasonId,
            competitionId,
        });

        await database
            .updateTable('staging.raw_scrape_logs')
            .set({ status: 'processed' })
            .where('id', '=', overviewLogId)
            .execute();
        await recordSourceResourceSuccess(database, overviewResource.id);
        activeResource = 'results';

        const dates = enumerateTournamentDates(metadata.startDate, metadata.endDate, 7);
        const pages = dates.length > 0 ? dates : [null];
        let matchRows = 0;
        let rejectedRows = 0;
        let duplicateLinks = 0;
        let duplicateConflicts = 0;
        const eventStatus = deriveVettsEventStatus(metadata);
        const isCancelled = isVettsCancelledTournament(metadata);

        for (const date of pages) {
            const matchesUrl = vettsUrls.matches(tournamentId, date);
            const resultsContext: SourceAdapterContext = {
                sourceInstanceId: sourceInstance.id,
                sourceResourceId: resultsResource.id,
                resourceType: 'event-results',
                externalId: `${tournamentId}:matches${date ? `:${date}` : ''}`,
                url: matchesUrl,
                config: { tournamentId, date },
            };
            const matchesHtml = await vettsSourceAdapter.extract(resultsContext);
            const logId = await storeScrapePayload(matchesUrl, platformId, matchesHtml, database);
            let parsedPage: VettsMatchesPage;
            try {
                parsedPage = asMatchesPage(
                    await vettsSourceAdapter.transform(matchesHtml, resultsContext),
                );
            } catch (error) {
                await markRawLogFailed(database, logId);
                throw error;
            }

            matchRows += parsedPage.matches.length;
            rejectedRows += parsedPage.issues.length;
            for (const issue of parsedPage.issues) {
                logger.warn?.(`VETTS ${tournamentId} row ${issue.rowIndex}: ${issue.message}`);
            }

            await upsertVettsResultRows(
                database as Kysely<any>,
                sourceEventId,
                parsedPage.matches,
            );
            await loadTTLeaguesData(database, {
                competitionId,
                platformId,
                parsedData: vettsMatchesToParsedData(metadata, parsedPage.matches),
                scrapeLogIds: [logId],
            });
            const duplicateResult = await reconcileVettsDuplicateRubbers(
                database as Kysely<any>,
                competitionId,
                parsedPage.matches,
            );
            duplicateLinks += duplicateResult.linked;
            duplicateConflicts += duplicateResult.conflicts;

            logger.info?.(
                `VETTS ${tournamentId}${date ? ` ${date}` : ''}: ${parsedPage.matches.length} matches, ` +
                `${parsedPage.issues.length} rejected, ${duplicateResult.linked} duplicate links`,
            );
        }

        if (eventStatus === 'completed' && matchRows === 0 && !isCancelled) {
            throw new Error(`VETTS completed tournament ${tournamentId} produced no parsed matches`);
        }

        await (database as Kysely<any>)
            .updateTable('competitions')
            .set({
                last_scraped_at: new Date(),
                event_status: isCancelled ? 'cancelled' : eventStatus,
                record_kind: deriveVettsRecordKind(eventStatus, isCancelled),
                ...(deriveVettsRecordKind(eventStatus, isCancelled) === 'calendar'
                    ? { processed_at: null }
                    : {}),
                publication_status: isCancelled ? 'cancelled' : null,
            })
            .where('id', '=', competitionId)
            .execute();
        await recordSourceResourceSuccess(database, resultsResource.id);

        return {
            tournamentId,
            competitionId,
            matchRows,
            rejectedRows,
            duplicateLinks,
            duplicateConflicts,
        };
    } catch (error) {
        if (activeResource === 'overview') {
            await recordSourceResourceFailure(database, overviewResource.id, error);
        } else {
            await recordSourceResourceFailure(database, resultsResource.id, error);
        }
        throw error;
    }
}
