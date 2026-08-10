import type { Kysely } from 'kysely';
import {
    fetchTtePage,
    parseTteEventPage,
    type TteCalendarEvent,
} from './tte-events-client.js';

const TTE_ORIGIN = 'https://www.tabletennisengland.co.uk';

export interface ManualTournamentSourceResolution {
    entryUrl: string;
    tteEvent: TteCalendarEvent | null;
}

export type ManualTournamentPageFetcher = (url: string) => Promise<string>;

export function isTteTournamentEventUrl(sourceUrl: string): boolean {
    try {
        const url = new URL(sourceUrl);
        return url.origin === TTE_ORIGIN && /^\/event\/[^/]+\/?$/.test(url.pathname);
    } catch {
        return false;
    }
}

/**
 * A user may paste either the entry form itself or the TTE information page.
 * For TTE event pages, use the exact calendar parser that the daily scrape uses
 * so the downstream entry-form inspection receives the same resolved form URL.
 */
export async function resolveManualTournamentSource(
    sourceUrl: string,
    fetchPage: ManualTournamentPageFetcher = fetchTtePage,
): Promise<ManualTournamentSourceResolution> {
    if (!isTteTournamentEventUrl(sourceUrl)) {
        return { entryUrl: sourceUrl, tteEvent: null };
    }

    try {
        const html = await fetchPage(sourceUrl);
        const event = parseTteEventPage(html, sourceUrl);
        return {
            entryUrl: event.entryUrl ?? sourceUrl,
            tteEvent: event,
        };
    } catch {
        // Preserve the existing generic web-form fallback when the TTE page is
        // temporarily unavailable or its markup cannot be parsed.
        return { entryUrl: sourceUrl, tteEvent: null };
    }
}

export async function applyManualTournamentSourceResolution(
    db: Kysely<any>,
    competitionId: string,
    resolution: ManualTournamentSourceResolution,
): Promise<void> {
    const event = resolution.tteEvent;
    if (!event) return;

    const category = event.categories.length > 0 ? event.categories.join(', ') : null;
    const entryDeadline = event.entryDeadline
        ? new Date(`${event.entryDeadline}T23:59:59Z`)
        : null;

    await db
        .updateTable('competitions')
        .set({
            display_name: event.name,
            description: event.description,
            event_date: event.startDate,
            start_date: event.startDate,
            end_date: event.endDate,
            entry_deadline: entryDeadline,
            entry_url: resolution.entryUrl,
            information_url: event.sourceUrl,
            venue_name: event.venueName,
            venue_address: event.venueAddress,
            venue_town: event.venueTown,
            venue_postcode: event.venuePostcode,
            organizer_name: event.organizerName,
            category,
        })
        .where('id', '=', competitionId)
        .execute();
}
