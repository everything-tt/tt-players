const VETTS_BASE_URL = 'https://vetts.tournamentsoftware.com';
const DEFAULT_DISCOVERY_URL = `${VETTS_BASE_URL}/find?StatusFilterID=2`;

export const vettsUrls = {
    discovery: DEFAULT_DISCOVERY_URL,
    tournament: (tournamentId: string) => `${VETTS_BASE_URL}/tournament/${tournamentId}`,
    matches: (tournamentId: string, date?: string | null) => {
        const suffix = date ? `/matches/${date.replaceAll('-', '')}` : '/Matches';
        return `${VETTS_BASE_URL}/tournament/${tournamentId}${suffix}`;
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

export async function fetchVettsDiscovery(url = DEFAULT_DISCOVERY_URL): Promise<string> {
    return fetchVettsHtml(url);
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
