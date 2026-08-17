import { runSourceRateLimited } from './source-rate-limit.js';

const VETTS_RESULTS_BASE_URL = 'https://vetts.tournamentsoftware.com';
const VETTS_CALENDAR_BASE_URL = 'https://www.vetts.org.uk';
const VETTS_SOURCE_RATE_KEY = 'vetts';
const VETTS_FETCH_MIN_INTERVAL_MS = Number(process.env['VETTS_FETCH_MIN_INTERVAL_MS'] ?? '750');
const VETTS_FETCH_TIMEOUT_MS = Number(process.env['VETTS_FETCH_TIMEOUT_MS'] ?? '30000');

export const vettsUrls = {
    discovery: (year: number) => `${VETTS_CALENDAR_BASE_URL}/tournaments.aspx?year=${year}`,
    tournament: (tournamentId: string) => `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}`,
    matches: (tournamentId: string, date?: string | null) => {
        const suffix = date ? `/matches/${date.replaceAll('-', '')}` : '/Matches';
        return `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}${suffix}`;
    },
};

const VETTS_CONSENT_COOKIE = 'st=cp=33&c=1';

function isVettsUrl(url: string): boolean {
    return url.startsWith(VETTS_CALENDAR_BASE_URL) || url.startsWith(VETTS_RESULTS_BASE_URL);
}

function isCookieWallResponse(url: string, body: string): boolean {
    if (/(?:\/|^)(?:cookies|cookiewall)(?:\/|$)/i.test(url)) return true;
    return /<form[^>]+action=["'][^"']*cookiewall/i.test(body)
        && /how do i clear cookies/i.test(body);
}

function retryAfterMs(response: Response): number {
    const value = response.headers.get('retry-after');
    if (!value) return 30_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 30_000 : Math.max(0, timestamp - Date.now());
}

export async function fetchVettsHtml(url: string): Promise<string> {
    const headers: Record<string, string> = {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
        'User-Agent': 'tt-players/1.0 (+https://ttp.tourneypilot.com)',
    };

    if (isVettsUrl(url)) headers['Cookie'] = VETTS_CONSENT_COOKIE;

    const response = await runSourceRateLimited(
        VETTS_SOURCE_RATE_KEY,
        Math.max(0, VETTS_FETCH_MIN_INTERVAL_MS),
        Math.max(1_000, VETTS_FETCH_TIMEOUT_MS + 10_000),
        () => fetch(url, {
            headers,
            signal: AbortSignal.timeout(VETTS_FETCH_TIMEOUT_MS),
        }),
        (result) => result.status === 429 ? retryAfterMs(result) : 0,
    );

    if (!response.ok) {
        throw new Error(`VETTS HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    const body = await response.text();
    if (isCookieWallResponse(response.url, body)) {
        throw new Error(`VETTS cookie wall blocked ${url}`);
    }

    return body;
}

export function vettsDiscoveryYears(
    now: Date = new Date(),
    count = Number(process.env['VETTS_DISCOVERY_YEARS'] ?? 2),
): number[] {
    const boundedCount = Number.isInteger(count) && count > 0 ? Math.min(count, 10) : 2;
    const currentYear = now.getUTCFullYear();
    return Array.from({ length: boundedCount }, (_value, index) => currentYear - index);
}

export async function fetchVettsDiscovery(year: number): Promise<string> {
    return fetchVettsHtml(vettsUrls.discovery(year));
}

export async function fetchVettsTournamentOverview(tournamentId: string): Promise<string> {
    return fetchVettsHtml(vettsUrls.tournament(tournamentId));
}

export async function fetchVettsTournamentMatches(
    tournamentId: string,
    date?: string | null,
): Promise<string> {
    return fetchVettsHtml(vettsUrls.matches(tournamentId, date));
}
