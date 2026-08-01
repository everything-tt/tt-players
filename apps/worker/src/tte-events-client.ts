import * as cheerio from 'cheerio';

const TTE_ORIGIN = 'https://www.tabletennisengland.co.uk';
export const TTE_ALL_COMPETITIONS_URL = `${TTE_ORIGIN}/events-cat/all-competitions/`;

export interface TteCompetitionArchive {
    eventUrls: string[];
    monthUrls: string[];
}

export interface TteCalendarEvent {
    sourceKey: string;
    sourceUrl: string;
    name: string;
    startDate: string;
    endDate: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueTown: string | null;
    venuePostcode: string | null;
    categories: string[];
    entryDeadline: string | null;
    entryUrl: string | null;
    publishedStatus: 'confirmed' | 'provisional' | 'cancelled' | 'postponed';
}

type JsonObject = Record<string, unknown>;

function absoluteTteUrl(value: string): string | null {
    try {
        const url = new URL(value, TTE_ORIGIN);
        if (url.origin !== TTE_ORIGIN) return null;
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

export function buildTteCompetitionArchiveUrl(date: string): string {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : (() => {
            throw new Error(`Invalid archive date: ${date}`);
        })();
    return `${TTE_ALL_COMPETITIONS_URL}?date=${normalized}`;
}

export function parseTteCompetitionArchive(html: string): TteCompetitionArchive {
    const $ = cheerio.load(html);
    const eventUrls = new Set<string>();
    const monthUrls = new Set<string>();

    $('a[href]').each((_index, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        const absolute = absoluteTteUrl(href);
        if (!absolute) return;
        const url = new URL(absolute);

        if (/^\/event\/[^/]+\/?$/.test(url.pathname)) {
            if (!url.pathname.endsWith('/')) url.pathname += '/';
            url.search = '';
            eventUrls.add(url.toString());
            return;
        }

        if (url.pathname === '/events-cat/all-competitions/' && /^\d{4}-\d{2}-01$/.test(url.searchParams.get('date') ?? '')) {
            monthUrls.add(url.toString());
        }
    });

    return {
        eventUrls: [...eventUrls],
        monthUrls: [...monthUrls].sort(),
    };
}

function asObject(value: unknown): JsonObject | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonObject
        : null;
}

function findEventNode(value: unknown): JsonObject | null {
    if (Array.isArray(value)) {
        for (const item of value) {
            const event = findEventNode(item);
            if (event) return event;
        }
        return null;
    }

    const object = asObject(value);
    if (!object) return null;
    const type = object['@type'];
    if (type === 'Event' || (Array.isArray(type) && type.includes('Event'))) return object;
    if ('@graph' in object) return findEventNode(object['@graph']);
    return null;
}

function parseEventJsonLd($: cheerio.CheerioAPI): JsonObject | null {
    let result: JsonObject | null = null;
    $('script[type="application/ld+json"]').each((_index, element) => {
        if (result) return;
        const raw = $(element).text().trim();
        if (!raw) return;
        try {
            result = findEventNode(JSON.parse(raw));
        } catch {
            // Ignore unrelated or malformed structured-data blocks and use DOM fallbacks.
        }
    });
    return result;
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): string | null {
    const text = stringValue(value);
    if (!text) return null;
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? null;
}

function parseEnglishDate(value: string): string | null {
    const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '').trim();
    const match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!match) return null;
    const months = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const month = months.indexOf(match[2].toLowerCase());
    if (month < 0) return null;
    const day = Number(match[1]);
    const year = Number(match[3]);
    if (day < 1 || day > 31) return null;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function entryDeadlineFromText(text: string): string | null {
    const match = text.match(/closing\s+date(?:\s+for\s+entries)?\s*:\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i);
    return match ? parseEnglishDate(match[1]) : null;
}

function sourceKeyFromUrl(sourceUrl: string): string | null {
    try {
        const url = new URL(sourceUrl);
        const match = url.pathname.match(/^\/event\/([^/]+)\/?$/);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

function findEntryUrl($: cheerio.CheerioAPI, sourceUrl: string): string | null {
    const candidates: Array<{ score: number; url: string }> = [];
    $('a[href]').each((_index, element) => {
        const label = $(element).text().replace(/\s+/g, ' ').trim().toLowerCase();
        if (!/(enter\s+online|online\s+entry|entry\s+form|download\s+entry)/.test(label)) return;
        const href = $(element).attr('href');
        if (!href) return;
        try {
            const absolute = new URL(href, sourceUrl).toString();
            const score = /enter\s+online|online\s+entry/.test(label) ? 2 : 1;
            candidates.push({ score, url: absolute });
        } catch {
            // Ignore malformed links.
        }
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url ?? null;
}

function categoriesFromDom($: cheerio.CheerioAPI): string[] {
    const categories = new Set<string>();
    $('.tribe-events-event-categories a, a[href*="/events-cat/"]').each((_index, element) => {
        const value = $(element).text().replace(/\s+/g, ' ').trim();
        if (value && !/^all competitions$/i.test(value)) categories.add(value);
    });
    return [...categories];
}

function publishedStatus(event: JsonObject, pageText: string): TteCalendarEvent['publishedStatus'] {
    const schemaStatus = stringValue(event.eventStatus)?.toLowerCase() ?? '';
    if (schemaStatus.includes('cancelled')) return 'cancelled';
    if (schemaStatus.includes('postponed')) return 'postponed';
    if (/\bcancelled\b/i.test(pageText)) return 'cancelled';
    if (/\bpostponed\b/i.test(pageText)) return 'postponed';
    if (/\bprovisional\b/i.test(pageText)) return 'provisional';
    return 'confirmed';
}

export function parseTteEventPage(html: string, sourceUrl: string): TteCalendarEvent {
    const sourceKey = sourceKeyFromUrl(sourceUrl);
    const $ = cheerio.load(html);
    const event = parseEventJsonLd($) ?? {};
    const pageText = $('body').text().replace(/\s+/g, ' ').trim();

    const name = stringValue(event.name)
        ?? $('h1').first().text().replace(/\s+/g, ' ').trim()
        ?? null;
    const startDate = dateOnly(event.startDate);
    const endDate = dateOnly(event.endDate);

    if (!sourceKey || !name || !startDate) {
        throw new Error(`Unable to parse TTE event: ${sourceUrl}`);
    }

    const location = asObject(event.location);
    const address = asObject(location?.address);

    return {
        sourceKey,
        sourceUrl,
        name,
        startDate,
        endDate,
        venueName: stringValue(location?.name),
        venueAddress: stringValue(address?.streetAddress),
        venueTown: stringValue(address?.addressLocality),
        venuePostcode: stringValue(address?.postalCode),
        categories: categoriesFromDom($),
        entryDeadline: entryDeadlineFromText(pageText),
        entryUrl: findEntryUrl($, sourceUrl),
        publishedStatus: publishedStatus(event, pageText),
    };
}

export async function fetchTtePage(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
    const response = await fetchImpl(url, {
        headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'tt-players-calendar-sync/1.0 (+https://github.com/wudong/tt-players)',
        },
    });
    if (!response.ok) {
        throw new Error(`TTE request failed (${response.status}) for ${url}`);
    }
    return response.text();
}
