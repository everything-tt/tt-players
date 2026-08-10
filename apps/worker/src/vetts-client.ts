const VETTS_RESULTS_BASE_URL = 'https://vetts.tournamentsoftware.com';
const VETTS_CALENDAR_BASE_URL = 'https://www.vetts.org.uk';

export const vettsUrls = {
    discovery: (year: number) => `${VETTS_CALENDAR_BASE_URL}/tournaments.aspx?year=${year}`,
    tournament: (tournamentId: string) => `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}`,
    matches: (tournamentId: string, date?: string | null) => {
        const suffix = date ? `/matches/${date.replaceAll('-', '')}` : '/Matches';
        return `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}${suffix}`;
    },
};

/**
 * Both VETTS hosts enforce a cookie consent wall that redirects requests to
 * /cookies/ or /cookiewall/ until consent is given. The consent cookie
 * `st=cp=33&c=1` bypasses this wall.
 */
const VETTS_CONSENT_COOKIE = 'st=cp=33&c=1';

function isVettsUrl(url: string): boolean {
    return url.startsWith(VETTS_CALENDAR_BASE_URL) || url.startsWith(VETTS_RESULTS_BASE_URL);
}

function isCookieWallResponse(url: string, body: string): boolean {
    if (/(?:\/|^)(?:cookies|cookiewall)(?:\/|$)/i.test(url)) return true;
    return /<form[^>]+action=["'][^"']*cookiewall/i.test(body) &&
        /how do i clear cookies/i.test(body);
}

export async function fetchVettsHtml(url: string): Promise<string> {
    const headers: Record<string, string> = {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
        'User-Agent': 'tt-players/1.0 (+https://ttp.tourneypilot.com)',
    };

    if (isVettsUrl(url)) {
        headers['Cookie'] = VETTS_CONSENT_COOKIE;
    }

    const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
    });

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
