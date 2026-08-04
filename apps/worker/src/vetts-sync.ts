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
import { VETTS_ADAPTER_KEY, VETTS_ADAPTER_VERSION } from './vetts-adapter.js';
import {
    fetchVettsTournamentMatches,
    fetchVettsTournamentOverview,
    vettsUrls,
} from './vetts-client.js';
import {
    enumerateTournamentDates,
    parseVettsMatchesPage,
    parseVettsTournamentOverview,
    vettsMatchesToParsedData,
} from './vetts-parser.js';
import { stabilizeVettsPlayerIdentities } from './vetts-player-identity.js';
import {
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

    try {
        const overviewHtml = await fetchVettsTournamentOverview(tournamentId);
        const metadata = parseVettsTournamentOverview(overviewHtml, overviewUrl);
        const overviewLogId = await storeScrapePayload(
            overviewUrl,
            platformId,
            overviewHtml,
            database,
        );
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

        const dates = enumerateTournamentDates(metadata.startDate, metadata.endDate, 7);
        const pages = dates.length > 0 ? dates : [null];
        let matchRows = 0;
        let rejectedRows = 0;
        let duplicateLinks = 0;
        let duplicateConflicts = 0;

        for (const date of pages) {
            const matchesUrl = vettsUrls.matches(tournamentId, date);
            const matchesHtml = await fetchVettsTournamentMatches(tournamentId, date);
            const logId = await storeScrapePayload(matchesUrl, platformId, matchesHtml, database);
            const parsedPage = stabilizeVettsPlayerIdentities(
                matchesHtml,
                tournamentId,
                parseVettsMatchesPage(matchesHtml, {
                    tournamentId,
                    sourceUrl: matchesUrl,
                    date,
                }),
            );
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

        const now = new Date();
        await (database as Kysely<any>)
            .updateTable('competitions')
            .set({
                last_scraped_at: now,
                ...(matchRows > 0 ? { event_status: 'completed' } : {}),
            })
            .where('id', '=', competitionId)
            .execute();
        await recordSourceResourceSuccess(database, overviewResource.id);
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
        await Promise.all([
            recordSourceResourceFailure(database, overviewResource.id, error),
            recordSourceResourceFailure(database, resultsResource.id, error),
        ]);
        throw error;
    }
}
