import * as cheerio from 'cheerio';

const TTE_ORIGIN = 'https://www.tabletennisengland.co.uk';
const MAX_PARSE_DIAGNOSTIC_WARNINGS = 5;
let parseDiagnosticWarnings = 0;

export const TTE_ALL_COMPETITIONS_URL = `${TTE_ORIGIN}/events-cat/all-competitions/`;

export interface TteCompetitionArchive {
    eventUrls: string[];
    monthUrls: string[];
}

export interface TteCalendarEvent {
    sourceKey: string;
    sourceUrl: string;
    name: string;
    description: string | null;
    startDate: string;
    endDate: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueTown: string | null;
    venuePostcode: string | null;
    venueUrl: string | null;
    organizerName: string | null;
    organizerUrl: string | null;
    categories: string[];
    entryDeadline: string | null;
    entryUrl: string | null;
    publishedStatus: 'confirmed' | 'provisional' | 'cancelled' | 'postponed';
}

export class TteEventParseError extends Error {
    readonly sourceUrl: string;

    constructor(sourceUrl: string, diagnostics?: string) {
        super(`Unable to parse TTE event: ${sourceUrl}${diagnostics ? `; ${diagnostics}` : ''}`);
        this.name = 'TteEventParseError';
        this.sourceUrl = sourceUrl;
    }
}

type JsonObject = Record<string, unknown>;

function absoluteTteUrl(value: string, baseUrl: string = TTE_ORIGIN): string | null {
    try {
        const url = new URL(value, baseUrl);
        if (url.origin !== TTE_ORIGIN) return null;
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

function absoluteUrlValue(value: unknown, baseUrl: string): string | null {
    const text = stringValue(value);
    if (!text) return null;
    try {
        const url = new URL(text, baseUrl);
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
        const absolute = absoluteTteUrl(href, TTE_ALL_COMPETITIONS_URL);
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

function firstObject(value: unknown): JsonObject | null {
    if (Array.isArray(value)) {
        for (const item of value) {
            const object = asObject(item);
            if (object) return object;
        }
        return null;
    }
    return asObject(value);
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

function plainTextValue(value: unknown): string | null {
    const text = stringValue(value);
    if (!text) return null;
    const normalized = cheerio.load(`<body>${text}</body>`)('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || null;
}

function dateOnly(value: unknown): string | null {
    const text = stringValue(value);
    if (!text) return null;
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? null;
}

function textFromDom($: cheerio.CheerioAPI, selectors: string[]): string | null {
    for (const selector of selectors) {
        const value = $(selector).first().text().replace(/\s+/g, ' ').trim();
        if (value) return value;
    }
    return null;
}

function hrefFromDom(
    $: cheerio.CheerioAPI,
    selectors: string[],
    baseUrl: string,
): string | null {
    for (const selector of selectors) {
        const href = $(selector).first().attr('href');
        const absolute = absoluteUrlValue(href, baseUrl);
        if (absolute) return absolute;
    }
    return null;
}

function nameFromTitle($: cheerio.CheerioAPI): string | null {
    const title = textFromDom($, ['title']);
    if (!title) return null;
    const name = title.replace(/\s+-\s+Table Tennis England\s*$/i, '').trim();
    return name || null;
}

function dateFromDom($: cheerio.CheerioAPI, selectors: string[]): string | null {
    const attributes = ['datetime', 'title', 'content', 'data-start-date', 'data-end-date', 'data-date'];
    for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length === 0) continue;
        for (const attribute of attributes) {
            const parsed = dateOnly(element.attr(attribute));
            if (parsed) return parsed;
        }
    }
    return null;
}

interface ScoredDateCandidate {
    date: string;
    score: number;
    order: number;
}

function scoredDateFromAnyAttribute($: cheerio.CheerioAPI): string | null {
    const candidates: ScoredDateCandidate[] = [];
    let order = 0;

    $('*').each((_index, element) => {
        const attributes = $(element).attr();
        if (!attributes) return;

        const context = [
            attributes.class,
            attributes.id,
            attributes.itemprop,
            attributes.property,
        ].filter(Boolean).join(' ').toLowerCase();

        for (const [attribute, value] of Object.entries(attributes)) {
            const date = dateOnly(value);
            if (!date) continue;

            const descriptor = `${attribute} ${context}`.toLowerCase();
            let score = 0;
            if (/(start|event|calendar|date|dtstart)/.test(descriptor)) score += 6;
            if (/00:00:00/.test(value)) score += 4;
            if (attribute === 'title' || attribute.startsWith('data-')) score += 1;
            if (/(modified|published|updated|article)/.test(descriptor)) score -= 12;
            if (/T\d{2}:\d{2}:\d{2}/.test(value) && !/T00:00:00/.test(value)) score -= 3;

            candidates.push({ date, score, order });
            order += 1;
        }
    });

    candidates.sort((left, right) => right.score - left.score || left.order - right.order);
    const best = candidates[0];
    return best && best.score >= 0 ? best.date : null;
}

function describeUnparseablePage($: cheerio.CheerioAPI, html: string): string {
    const title = textFromDom($, ['title']) ?? '';
    const heading = textFromDom($, ['h1']) ?? '';
    const bodySample = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 180);
    const dateCandidates = new Set<string>();

    $('*').each((_index, element) => {
        const attributes = $(element).attr();
        if (!attributes) return;
        for (const value of Object.values(attributes)) {
            if (/\d{4}-\d{2}-\d{2}/.test(value)) dateCandidates.add(value.slice(0, 80));
            if (dateCandidates.size >= 5) return false;
        }
        return undefined;
    });

    return [
        `htmlLength=${html.length}`,
        `title=${JSON.stringify(title.slice(0, 100))}`,
        `heading=${JSON.stringify(heading.slice(0, 100))}`,
        `dateCandidates=${JSON.stringify([...dateCandidates])}`,
        `bodySample=${JSON.stringify(bodySample)}`,
    ].join(', ');
}

function parseEnglishDate(value: string): string | null {
    const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '').trim();
    const match = cleaned.match(/^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
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
    const match = text.match(/closing\s+date(?:\s+for\s+entries)?\s*:\s*((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i);
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
        ?? textFromDom($, ['h1.tribe-events-single-event-title', 'h1'])
        ?? nameFromTitle($);
    const startDate = dateOnly(event.startDate)
        ?? dateFromDom($, [
            '[itemprop="startDate"]',
            '.tribe-events-start-date',
            '.tribe-event-date-start',
            'time.tribe-events-start-date',
        ])
        ?? scoredDateFromAnyAttribute($);
    const endDate = dateOnly(event.endDate)
        ?? dateFromDom($, [
            '[itemprop="endDate"]',
            '.tribe-events-end-date',
            '.tribe-event-date-end',
            'time.tribe-events-end-date',
        ]);

    if (!sourceKey || !name || !startDate) {
        const error = new TteEventParseError(sourceUrl, describeUnparseablePage($, html));
        if (parseDiagnosticWarnings < MAX_PARSE_DIAGNOSTIC_WARNINGS) {
            console.warn(error.message);
            parseDiagnosticWarnings += 1;
        }
        throw error;
    }

    const location = firstObject(event.location);
    const address = firstObject(location?.address);
    const organizer = firstObject(event.organizer);

    return {
        sourceKey,
        sourceUrl,
        name,
        description: plainTextValue(event.description)
            ?? textFromDom($, [
                '.tribe-events-single-event-description',
                '[itemprop="description"]',
                '.event-description',
            ]),
        startDate,
        endDate,
        venueName: stringValue(location?.name)
            ?? textFromDom($, ['.tribe-events-meta-group-venue .tribe-venue', '.tribe-venue']),
        venueAddress: stringValue(address?.streetAddress)
            ?? textFromDom($, ['.tribe-events-address .tribe-street-address', '.tribe-street-address']),
        venueTown: stringValue(address?.addressLocality)
            ?? textFromDom($, ['.tribe-events-address .tribe-locality', '.tribe-locality']),
        venuePostcode: stringValue(address?.postalCode)
            ?? textFromDom($, ['.tribe-events-address .tribe-postal-code', '.tribe-postal-code']),
        venueUrl: absoluteUrlValue(location?.url, sourceUrl)
            ?? hrefFromDom($, [
                '.tribe-events-meta-group-venue .tribe-venue-url a[href]',
                '.tribe-venue-url a[href]',
            ], sourceUrl),
        organizerName: stringValue(organizer?.name)
            ?? stringValue(event.organizer)
            ?? textFromDom($, [
                '.tribe-events-meta-group-organizer .tribe-organizer',
                '.tribe-organizer',
            ]),
        organizerUrl: absoluteUrlValue(organizer?.url, sourceUrl)
            ?? hrefFromDom($, [
                '.tribe-events-meta-group-organizer .tribe-organizer-url a[href]',
                '.tribe-organizer-url a[href]',
            ], sourceUrl),
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
