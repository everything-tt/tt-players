import { load as loadHtml } from 'cheerio';
import { runSourceRateLimited } from './source-rate-limit.js';

const TTE_BASE_URL = 'https://www.tabletennisengland.co.uk';
const TTE_SOURCE_RATE_KEY = 'tte-calendar';
const TTE_FETCH_MIN_INTERVAL_MS = Number(process.env['TTE_FETCH_MIN_INTERVAL_MS'] ?? '500');
const TTE_FETCH_TIMEOUT_MS = Number(process.env['TTE_FETCH_TIMEOUT_MS'] ?? '30000');

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
    publishedStatus: 'confirmed' | 'cancelled' | 'postponed';
}

export interface TteCompetitionArchive {
    eventUrls: string[];
}

const MONTHS: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeYear(value: string): number {
    const year = Number(value);
    if (value.length === 2) return year >= 70 ? 1900 + year : 2000 + year;
    return year;
}

function parseDateToken(value: string): string | null {
    const normalized = value.replace(/\u00a0/g, ' ').trim();
    let match = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/i);
    if (match) {
        const month = MONTHS[match[2].toLowerCase()];
        if (month) return isoDate(normalizeYear(match[3]), month, Number(match[1]));
    }

    match = normalized.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{2,4})\b/i);
    if (match) {
        const month = MONTHS[match[1].toLowerCase()];
        if (month) return isoDate(normalizeYear(match[3]), month, Number(match[2]));
    }

    match = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (match) return isoDate(normalizeYear(match[3]), Number(match[2]), Number(match[1]));
    return null;
}

function parseDateRange(value: string): { startDate: string | null; endDate: string | null } {
    const text = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const sameMonth = text.match(
        /(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{2,4})/i,
    );
    if (sameMonth) {
        const month = MONTHS[sameMonth[3].toLowerCase()];
        if (month) {
            const year = normalizeYear(sameMonth[4]);
            return {
                startDate: isoDate(year, month, Number(sameMonth[1])),
                endDate: isoDate(year, month, Number(sameMonth[2])),
            };
        }
    }

    const explicitRange = text.match(
        /(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{2,4})\s*[-–]\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
    );
    if (explicitRange) {
        return {
            startDate: parseDateToken(explicitRange[1]),
            endDate: parseDateToken(explicitRange[2]),
        };
    }

    const startDate = parseDateToken(text);
    return { startDate, endDate: null };
}

function normalizeText(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized || null;
}

function absoluteUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return new URL(value, TTE_BASE_URL).toString();
    } catch {
        return null;
    }
}

function sourceKeyFromUrl(sourceUrl: string): string {
    const url = new URL(sourceUrl, TTE_BASE_URL);
    const match = url.pathname.match(/^\/event\/([^/]+)\/?$/);
    if (!match) throw new Error(`Unsupported TTE event URL: ${sourceUrl}`);
    return match[1];
}

function bodyLabelValue(bodyText: string, label: string): string | null {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}\\s*:?\\s*([^\\n|]+)`, 'i');
    return normalizeText(bodyText.match(pattern)?.[1]);
}

function parsePostcode(value: string | null): string | null {
    if (!value) return null;
    return value.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? null;
}

function eventStatusFromText(value: string): TteCalendarEvent['publishedStatus'] {
    if (/\bcancel(?:led|ed)\b/i.test(value)) return 'cancelled';
    if (/\bpostponed\b/i.test(value)) return 'postponed';
    return 'confirmed';
}

export class TteEventParseError extends Error {
    constructor(
        message: string,
        readonly sourceUrl: string,
    ) {
        super(message);
        this.name = 'TteEventParseError';
    }
}

export function buildTteCompetitionArchiveUrl(month: string): string {
    const parsed = month.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!parsed) throw new Error(`Invalid TTE archive month: ${month}`);
    return `${TTE_BASE_URL}/events/category/competition/list/?tribe-bar-date=${parsed[1]}-${parsed[2]}-01`;
}

export function parseTteCompetitionArchive(html: string): TteCompetitionArchive {
    const $ = loadHtml(html);
    const urls = new Set<string>();
    $('a[href]').each((_index, element) => {
        const href = $(element).attr('href');
        const url = absoluteUrl(href);
        if (!url) return;
        const pathname = new URL(url).pathname;
        if (/^\/event\/[^/]+\/?$/.test(pathname)) urls.add(url);
    });
    return { eventUrls: [...urls].sort() };
}

export function parseTteEventPage(html: string, sourceUrl: string): TteCalendarEvent {
    const $ = loadHtml(html);
    const bodyText = $('body').text().replace(/\r/g, '\n');
    const heading = normalizeText($('h1').first().text());
    const title = normalizeText($('title').text());
    const name = heading
        ?? title?.replace(/\s*[|–-].*Table Tennis England.*$/i, '').trim()
        ?? null;
    if (!name) throw new TteEventParseError(`Unable to parse TTE event name: ${sourceUrl}`, sourceUrl);

    const dateCandidates = [
        $('[class*="tribe-events-start-date"]').first().text(),
        $('time[datetime]').first().attr('datetime') ?? '',
        bodyLabelValue(bodyText, 'Date') ?? '',
        bodyText,
    ];
    let startDate: string | null = null;
    let endDate: string | null = null;
    for (const candidate of dateCandidates) {
        if (!candidate) continue;
        const dateTimeMatch = candidate.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateTimeMatch) {
            startDate = dateTimeMatch[1];
            break;
        }
        const range = parseDateRange(candidate);
        if (range.startDate) {
            startDate = range.startDate;
            endDate = range.endDate;
            break;
        }
    }
    if (!startDate) {
        const bodySample = normalizeText(bodyText)?.slice(0, 300) ?? '';
        throw new TteEventParseError(
            `Unable to parse TTE event date: ${sourceUrl}; htmlLength=${html.length}, title=${JSON.stringify(title ?? '')}, heading=${JSON.stringify(heading ?? '')}, dateCandidates=${JSON.stringify(dateCandidates.map((value) => normalizeText(value)?.slice(0, 120) ?? ''))}, bodySample=${JSON.stringify(bodySample)}`,
            sourceUrl,
        );
    }

    const endTime = $('time[datetime]').eq(1).attr('datetime');
    if (!endDate && endTime?.match(/^\d{4}-\d{2}-\d{2}/)) endDate = endTime.slice(0, 10);

    const venueBlock = $('[class*="tribe-venue"], [class*="venue"]')
        .filter((_index, element) => /venue/i.test($(element).text()))
        .first();
    const venueName = normalizeText(
        $('[class*="tribe-venue"] a, [class*="tribe-venue"] dd, [class*="venue"] a')
            .filter((_index, element) => !/map/i.test($(element).text()))
            .first()
            .text(),
    ) ?? bodyLabelValue(bodyText, 'Venue');
    const venueAddress = normalizeText(
        venueBlock.find('[class*="address"], address').first().text(),
    ) ?? bodyLabelValue(bodyText, 'Address');
    const venueTown = normalizeText(
        venueBlock.find('[class*="locality"], [class*="city"]').first().text(),
    );
    const venuePostcode = normalizeText(
        venueBlock.find('[class*="postal"], [class*="zip"]').first().text(),
    ) ?? parsePostcode(venueAddress ?? bodyText);
    const venueUrl = absoluteUrl(
        venueBlock.find('a[href*="map"], a[href*="maps"]').first().attr('href'),
    );

    const organizerBlock = $('[class*="organizer"], [class*="organiser"]').first();
    const organizerName = normalizeText(
        organizerBlock.find('a').first().text() || organizerBlock.text(),
    ) ?? bodyLabelValue(bodyText, 'Organiser')
        ?? bodyLabelValue(bodyText, 'Organizer');
    const organizerUrl = absoluteUrl(organizerBlock.find('a[href]').first().attr('href'));

    const entryDeadlineRaw = bodyLabelValue(bodyText, 'Entry Deadline')
        ?? bodyLabelValue(bodyText, 'Closing Date')
        ?? bodyLabelValue(bodyText, 'Closing date');
    const entryDeadline = entryDeadlineRaw ? parseDateToken(entryDeadlineRaw) : null;
    let entryUrl: string | null = null;
    $('a[href]').each((_index, element) => {
        if (entryUrl) return;
        const text = normalizeText($(element).text()) ?? '';
        const href = absoluteUrl($(element).attr('href'));
        if (href && /enter|entry|book|register/i.test(text)) entryUrl = href;
    });

    const categories = new Set<string>();
    $('[class*="tribe-events-event-categories"] a, a[href*="/category/"]').each((_index, element) => {
        const value = normalizeText($(element).text());
        if (value && !/^competition$/i.test(value)) categories.add(value);
    });
    for (const match of bodyText.matchAll(/\b(?:1|2|3|4)-?star\b/gi)) categories.add(match[0]);
    for (const match of bodyText.matchAll(/\b(?:1|2|3|4)\*\b/g)) categories.add(match[0]);

    const description = normalizeText(
        $('[class*="tribe-events-single-event-description"], .entry-content').first().text(),
    );

    return {
        sourceKey: sourceKeyFromUrl(sourceUrl),
        sourceUrl: new URL(sourceUrl, TTE_BASE_URL).toString(),
        name,
        description,
        startDate,
        endDate,
        venueName,
        venueAddress,
        venueTown,
        venuePostcode,
        venueUrl,
        organizerName,
        organizerUrl,
        categories: [...categories].sort(),
        entryDeadline,
        entryUrl,
        publishedStatus: eventStatusFromText(`${name}\n${bodyText}`),
    };
}

function retryAfterMs(response: Response): number {
    const value = response.headers.get('retry-after');
    if (!value) return 30_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 30_000 : Math.max(0, timestamp - Date.now());
}

export async function fetchTtePage(
    url: string,
    fetchImpl: typeof fetch = fetch,
): Promise<string> {
    const operation = () => fetchImpl(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'tt-players/1.0 (+https://ttp.tourneypilot.com)',
        },
        signal: AbortSignal.timeout(TTE_FETCH_TIMEOUT_MS),
    });
    const response = fetchImpl === fetch
        ? await runSourceRateLimited(
            TTE_SOURCE_RATE_KEY,
            Math.max(0, TTE_FETCH_MIN_INTERVAL_MS),
            Math.max(1_000, TTE_FETCH_TIMEOUT_MS + 10_000),
            operation,
            (result) => result.status === 429 ? retryAfterMs(result) : 0,
        )
        : await operation();

    if (!response.ok) {
        throw new Error(`TTE calendar HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.text();
}
