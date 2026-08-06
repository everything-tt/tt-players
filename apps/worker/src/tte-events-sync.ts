import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import {
    buildTteCompetitionArchiveUrl,
    fetchTtePage,
    parseTteCompetitionArchive,
    parseTteEventPage,
    TteEventParseError,
    type TteCalendarEvent,
} from './tte-events-client.js';
import { normalizeTournamentName, normalizeVenue } from './tournament-normalization.js';

export interface DiscoverTteCalendarEventsOptions {
    startMonth: string;
    endMonth: string;
    concurrency?: number;
    fetchPage?: (url: string) => Promise<string>;
}

export interface TteCalendarParseFailure {
    sourceKey: string;
    sourceUrl: string;
    message: string;
}

export interface TteCalendarDiscoveryResult {
    events: TteCalendarEvent[];
    seenSourceKeys: string[];
    parseFailures: TteCalendarParseFailure[];
}

export interface SyncTteCalendarOptions extends DiscoverTteCalendarEventsOptions {
    now?: Date;
}

export interface SyncTteCalendarSummary {
    archiveMonths: number;
    discovered: number;
    parseFailures: number;
    created: number;
    updated: number;
    unchanged: number;
    missing: number;
    unpublished: number;
}

type CalendarLifecycleInput = Pick<
    TteCalendarEvent,
    'publishedStatus' | 'startDate' | 'endDate' | 'entryDeadline'
>;

function parseMonth(value: string): { year: number; month: number } | null {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { year, month };
}

export function buildMonthRange(startMonth: string, endMonth: string): string[] {
    const start = parseMonth(startMonth);
    const end = parseMonth(endMonth);
    if (!start || !end) throw new Error(`Invalid month range: ${startMonth} to ${endMonth}`);

    const startIndex = start.year * 12 + start.month - 1;
    const endIndex = end.year * 12 + end.month - 1;
    if (startIndex > endIndex || endIndex - startIndex > 60) {
        throw new Error(`Invalid month range: ${startMonth} to ${endMonth}`);
    }

    const months: string[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
        const year = Math.floor(index / 12);
        const month = index % 12 + 1;
        months.push(`${year}-${String(month).padStart(2, '0')}-01`);
    }
    return months;
}

function utcDay(value: string): number {
    return Date.parse(`${value}T00:00:00Z`);
}

export function deriveCalendarEventStatus(
    event: CalendarLifecycleInput,
    now: Date = new Date(),
): string {
    if (event.publishedStatus === 'cancelled') return 'cancelled';
    if (event.publishedStatus === 'postponed') return 'postponed';

    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const start = utcDay(event.startDate);
    const end = utcDay(event.endDate ?? event.startDate);

    if (today > end) return 'awaiting_results';
    if (today >= start && today <= end) return 'in_progress';

    if (event.entryDeadline) {
        return today <= utcDay(event.entryDeadline) ? 'entries_open' : 'entries_closed';
    }
    return 'upcoming';
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await mapper(items[index]);
        }
    });

    await Promise.all(workers);
    return results;
}

function sourceKeyFromEventUrl(sourceUrl: string): string | null {
    try {
        const match = new URL(sourceUrl).pathname.match(/^\/event\/([^/]+)\/?$/);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export async function discoverTteCalendarEventsDetailed(
    options: DiscoverTteCalendarEventsOptions,
): Promise<TteCalendarDiscoveryResult> {
    const months = buildMonthRange(options.startMonth, options.endMonth);
    const fetchPage = options.fetchPage ?? ((url: string) => fetchTtePage(url));
    const eventUrls = new Set<string>();

    for (const month of months) {
        const archiveUrl = buildTteCompetitionArchiveUrl(month);
        const html = await fetchPage(archiveUrl);
        for (const eventUrl of parseTteCompetitionArchive(html).eventUrls) {
            eventUrls.add(eventUrl);
        }
    }

    if (eventUrls.size === 0) {
        throw new Error('No TTE competition events discovered; refusing to treat the calendar as empty');
    }

    const sortedUrls = [...eventUrls].sort();
    const seenSourceKeys = sortedUrls
        .map(sourceKeyFromEventUrl)
        .filter((sourceKey): sourceKey is string => Boolean(sourceKey))
        .sort();

    const outcomes = await mapWithConcurrency(
        sortedUrls,
        Math.max(1, Math.min(options.concurrency ?? 4, 8)),
        async (sourceUrl): Promise<
            | { event: TteCalendarEvent; failure?: never }
            | { event?: never; failure: TteCalendarParseFailure }
        > => {
            const html = await fetchPage(sourceUrl);
            try {
                return { event: parseTteEventPage(html, sourceUrl) };
            } catch (error) {
                if (!(error instanceof TteEventParseError)) throw error;
                const sourceKey = sourceKeyFromEventUrl(sourceUrl);
                if (!sourceKey) throw error;
                return {
                    failure: {
                        sourceKey,
                        sourceUrl,
                        message: error.message,
                    },
                };
            }
        },
    );

    const events = outcomes
        .flatMap((outcome) => outcome.event ? [outcome.event] : [])
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    const parseFailures = outcomes
        .flatMap((outcome) => outcome.failure ? [outcome.failure] : [])
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

    if (events.length === 0) {
        throw new Error(
            `No usable TTE competition events parsed; ${parseFailures.length} detail pages failed`,
        );
    }

    return { events, seenSourceKeys, parseFailures };
}

export async function discoverTteCalendarEvents(
    options: DiscoverTteCalendarEventsOptions,
): Promise<TteCalendarEvent[]> {
    return (await discoverTteCalendarEventsDetailed(options)).events;
}

function seasonIdentity(startDate: string): { externalId: string; name: string } {
    const [yearText, monthText] = startDate.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const startYear = month >= 7 ? year : year - 1;
    const endYear = startYear + 1;
    return {
        externalId: `tte-events-${startYear}-${endYear}`,
        name: `TTE Events ${startYear}/${String(endYear).slice(-2)}`,
    };
}

function payloadHash(event: TteCalendarEvent): string {
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

function toDate(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

async function ensureHierarchy(db: Kysely<any>, event: TteCalendarEvent): Promise<string> {
    let platform = await db
        .selectFrom('platforms')
        .select('id')
        .where('base_url', '=', 'https://www.tabletennisengland.co.uk')
        .executeTakeFirst();
    if (!platform) {
        platform = await db
            .insertInto('platforms')
            .values({
                name: 'Table Tennis England',
                base_url: 'https://www.tabletennisengland.co.uk',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }

    let league = await db
        .selectFrom('leagues')
        .select('id')
        .where('platform_id', '=', platform.id)
        .where('external_id', '=', 'tte-calendar-events')
        .executeTakeFirst();
    if (!league) {
        league = await db
            .insertInto('leagues')
            .values({
                platform_id: platform.id,
                external_id: 'tte-calendar-events',
                name: 'Table Tennis England Competition Events',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }

    const season = seasonIdentity(event.startDate);
    let seasonRow = await db
        .selectFrom('seasons')
        .select('id')
        .where('league_id', '=', league.id)
        .where('external_id', '=', season.externalId)
        .executeTakeFirst();
    if (!seasonRow) {
        seasonRow = await db
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: season.externalId,
                name: season.name,
                is_active: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }
    return seasonRow.id;
}

async function upsertCalendarEvent(
    db: Kysely<any>,
    event: TteCalendarEvent,
    now: Date,
): Promise<'created' | 'updated' | 'unchanged'> {
    const hash = payloadHash(event);
    const existingSource = await db
        .selectFrom('tournament_sources as ts')
        .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
        .select(['ts.competition_id', 'ts.payload_hash', 'c.processed_at'])
        .where('ts.provider', '=', 'tte')
        .where('ts.source_type', '=', 'calendar')
        .where('ts.source_key', '=', event.sourceKey)
        .executeTakeFirst();
    const status = existingSource?.processed_at
        ? 'processed'
        : deriveCalendarEventStatus(event, now);

    if (existingSource?.payload_hash === hash) {
        await db
            .updateTable('tournament_sources')
            .set({ last_seen_at: now, missing_count: 0, updated_at: now })
            .where('provider', '=', 'tte')
            .where('source_type', '=', 'calendar')
            .where('source_key', '=', event.sourceKey)
            .execute();
        await db
            .updateTable('competitions')
            .set({
                event_status: status,
                record_kind: 'calendar',
                calendar_last_seen_at: now,
            })
            .where('id', '=', existingSource.competition_id)
            .execute();
        return 'unchanged';
    }

    const seasonId = await ensureHierarchy(db, event);
    const category = event.categories.length > 0 ? event.categories.join(', ') : null;
    const entryDeadline = event.entryDeadline
        ? new Date(`${event.entryDeadline}T23:59:59Z`)
        : null;

    if (existingSource) {
        await db
            .updateTable('competitions')
            .set({
                season_id: seasonId,
                name: event.name,
                display_name: event.name,
                event_date: event.startDate,
                start_date: event.startDate,
                end_date: event.endDate,
                venue_name: event.venueName,
                venue_address: event.venueAddress,
                venue_town: event.venueTown,
                venue_postcode: event.venuePostcode,
                entry_deadline: entryDeadline,
                entry_url: event.entryUrl,
                information_url: event.sourceUrl,
                event_status: status,
                record_kind: 'calendar',
                normalized_name: normalizeTournamentName(event.name),
                normalized_venue: normalizeVenue(
                    [event.venueName, event.venueTown, event.venuePostcode].filter(Boolean).join(' '),
                ),
                category,
                source: 'tte-calendar',
                source_url: event.sourceUrl,
                calendar_last_seen_at: now,
                calendar_missing_count: 0,
            })
            .where('id', '=', existingSource.competition_id)
            .execute();
        await db
            .updateTable('tournament_sources')
            .set({
                external_id: event.sourceKey,
                source_url: event.sourceUrl,
                payload_hash: hash,
                raw_payload: event,
                last_seen_at: now,
                missing_count: 0,
                updated_at: now,
            })
            .where('provider', '=', 'tte')
            .where('source_type', '=', 'calendar')
            .where('source_key', '=', event.sourceKey)
            .execute();
        return 'updated';
    }

    const competition = await db
        .insertInto('competitions')
        .values({
            season_id: seasonId,
            external_id: `tte:event:${event.sourceKey}`,
            name: event.name,
            display_name: event.name,
            event_date: event.startDate,
            start_date: event.startDate,
            end_date: event.endDate,
            venue_name: event.venueName,
            venue_address: event.venueAddress,
            venue_town: event.venueTown,
            venue_postcode: event.venuePostcode,
            entry_deadline: entryDeadline,
            entry_url: event.entryUrl,
            information_url: event.sourceUrl,
            event_status: status,
            record_kind: 'calendar',
            normalized_name: normalizeTournamentName(event.name),
            normalized_venue: normalizeVenue(
                [event.venueName, event.venueTown, event.venuePostcode].filter(Boolean).join(' '),
            ),
            category,
            type: 'individual',
            source: 'tte-calendar',
            source_url: event.sourceUrl,
            calendar_first_seen_at: now,
            calendar_last_seen_at: now,
            calendar_missing_count: 0,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

    await db
        .insertInto('tournament_sources')
        .values({
            competition_id: competition.id,
            provider: 'tte',
            source_type: 'calendar',
            external_id: event.sourceKey,
            source_url: event.sourceUrl,
            source_key: event.sourceKey,
            payload_hash: hash,
            raw_payload: event,
            first_seen_at: now,
            last_seen_at: now,
            missing_count: 0,
            match_method: 'source-key',
            match_confidence: 1,
            created_at: now,
            updated_at: now,
        })
        .execute();

    return 'created';
}

export async function syncTteCalendarEvents(
    db: Kysely<any>,
    options: SyncTteCalendarOptions,
): Promise<SyncTteCalendarSummary> {
    const now = options.now ?? new Date();
    const months = buildMonthRange(options.startMonth, options.endMonth);
    const discovery = await discoverTteCalendarEventsDetailed(options);
    const events = discovery.events;
    const seen = new Set(discovery.seenSourceKeys);

    for (const failure of discovery.parseFailures) {
        console.warn(`Quarantined malformed TTE event ${failure.sourceUrl}: ${failure.message}`);
    }

    const summary: SyncTteCalendarSummary = {
        archiveMonths: months.length,
        discovered: events.length,
        parseFailures: discovery.parseFailures.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        missing: 0,
        unpublished: 0,
    };

    for (const event of events) {
        const outcome = await upsertCalendarEvent(db, event, now);
        summary[outcome] += 1;
    }

    const windowStart = `${options.startMonth}-01`;
    const end = parseMonth(options.endMonth);
    if (!end) throw new Error(`Invalid end month: ${options.endMonth}`);
    const nextMonthIndex = end.year * 12 + end.month;
    const windowEnd = `${Math.floor(nextMonthIndex / 12)}-${String(nextMonthIndex % 12 + 1).padStart(2, '0')}-01`;

    const existingSources = await db
        .selectFrom('tournament_sources as ts')
        .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
        .select(['ts.source_key', 'ts.competition_id', 'ts.missing_count', 'c.start_date'])
        .where('ts.provider', '=', 'tte')
        .where('ts.source_type', '=', 'calendar')
        .where('c.start_date', '>=', windowStart)
        .where('c.start_date', '<', windowEnd)
        .execute();

    for (const source of existingSources) {
        if (seen.has(source.source_key)) continue;
        const missingCount = Number(source.missing_count ?? 0) + 1;
        summary.missing += 1;
        await db
            .updateTable('tournament_sources')
            .set({ missing_count: missingCount, updated_at: now })
            .where('provider', '=', 'tte')
            .where('source_type', '=', 'calendar')
            .where('source_key', '=', source.source_key)
            .execute();
        await db
            .updateTable('competitions')
            .set({
                calendar_missing_count: missingCount,
                ...(missingCount >= 3 ? { event_status: 'unpublished' } : {}),
            })
            .where('id', '=', source.competition_id)
            .execute();
        if (missingCount >= 3) summary.unpublished += 1;
    }

    return summary;
}

export function defaultTteCalendarWindow(now: Date = new Date()): {
    startMonth: string;
    endMonth: string;
} {
    const currentIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const format = (index: number) => {
        const year = Math.floor(index / 12);
        const month = index % 12 + 1;
        return `${year}-${String(month).padStart(2, '0')}`;
    };
    return {
        startMonth: format(currentIndex - 18),
        endMonth: format(currentIndex + 18),
    };
}
