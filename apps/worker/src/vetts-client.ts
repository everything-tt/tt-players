const VETTS_RESULTS_BASE_URL = 'https://vetts.tournamentsoftware.com';
const VETTS_CALENDAR_BASE_URL = 'https://www.vetts.org.uk';

// VETTS was founded in 1984 and held its first National Championships that year.
// Manual full-history backfills scan from the current year back to this boundary.
export const VETTS_FIRST_TOURNAMENT_YEAR = 1984;

export const vettsUrls = {
    discovery: (year: number) => `${VETTS_CALENDAR_BASE_URL}/tournaments.aspx?year=${year}`,
    tournament: (tournamentId: string) => `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}`,
    matches: (tournamentId: string, date?: string | null) => {
        const suffix = date ? `/matches/${date.replaceAll('-', '')}` : '/Matches';
        return `${VETTS_RESULTS_BASE_URL}/tournament/${tournamentId}${suffix}`;
    },
};

export async function fetchVettsHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-GB,en;q=0.9',
            'User-Agent': 'tt-players/1.0 (+https://ttp.tourneypilot.com)',
        },
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        throw new Error(`VETTS HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    return response.text();
}

function configuredDiscoveryYears(): number | 'all' {
    const raw = (process.env['VETTS_DISCOVERY_YEARS'] ?? '2').trim().toLowerCase();
    if (raw === 'all') return 'all';
    const count = Number(raw);
    return Number.isInteger(count) && count > 0 ? count : 2;
}

export function vettsDiscoveryYears(
    now: Date = new Date(),
    count: number | 'all' = configuredDiscoveryYears(),
): number[] {
    const currentYear = now.getUTCFullYear();
    const availableYearCount = Math.max(1, currentYear - VETTS_FIRST_TOURNAMENT_YEAR + 1);
    const requestedCount = count === 'all'
        ? availableYearCount
        : Math.min(Math.max(1, count), availableYearCount);

    return Array.from({ length: requestedCount }, (_value, index) => currentYear - index);
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
