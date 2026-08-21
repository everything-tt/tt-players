export const TTLEAGUES_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';

export interface TTLeaguesCompetition {
    id: number;
    name: string;
}

export interface TTLeaguesDivision {
    id: number;
    name: string;
}

export interface DiscoveredTTLeaguesCompetition extends TTLeaguesCompetition {
    divisions: TTLeaguesDivision[];
}

export interface TTLeaguesCompetitionCatalogue {
    tenantHost: string;
    competitions: TTLeaguesCompetition[];
}

export interface TTLeaguesTenantDiscovery {
    tenantHost: string;
    status: 'healthy' | 'no_active_competition';
    competitions: DiscoveredTTLeaguesCompetition[];
}

export interface TTLeaguesDiscoveryOptions {
    fetchImpl?: typeof fetch;
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`TT Leagues ${label} response must be an array`);
    }
}

function parseCompetition(value: unknown): TTLeaguesCompetition {
    if (!value || typeof value !== 'object') {
        throw new Error('TT Leagues competition entry must be an object');
    }
    const row = value as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('TT Leagues competition id must be a positive integer');
    }
    if (typeof row.name !== 'string' || row.name.trim().length === 0) {
        throw new Error(`TT Leagues competition ${id} must have a name`);
    }
    return { id, name: row.name.trim() };
}

function parseDivision(value: unknown): TTLeaguesDivision {
    if (!value || typeof value !== 'object') {
        throw new Error('TT Leagues division entry must be an object');
    }
    const row = value as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('TT Leagues division id must be a positive integer');
    }
    if (typeof row.name !== 'string') {
        throw new Error(`TT Leagues division ${id} must have a string name`);
    }
    return { id, name: row.name.trim() };
}

export async function fetchTTLeaguesJson(
    url: string,
    tenantHost: string,
    options: TTLeaguesDiscoveryOptions = {},
): Promise<unknown> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(url, {
        headers: {
            Tenant: tenantHost,
            Entry: '1',
            'User-Agent': 'tt-players/1.0',
        },
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.json();
}

export async function discoverTTLeaguesCompetitions(
    baseUrl: string,
    options: TTLeaguesDiscoveryOptions = {},
): Promise<TTLeaguesCompetitionCatalogue> {
    const tenantHost = new URL(baseUrl).host;
    const payload = await fetchTTLeaguesJson(
        `${TTLEAGUES_API_BASE}/competitions`,
        tenantHost,
        options,
    );
    assertArray(payload, 'competition catalogue');
    return {
        tenantHost,
        competitions: payload.map(parseCompetition),
    };
}

export async function discoverTTLeaguesDivisions(
    tenantHost: string,
    competitionId: number,
    options: TTLeaguesDiscoveryOptions = {},
): Promise<TTLeaguesDivision[]> {
    const payload = await fetchTTLeaguesJson(
        `${TTLEAGUES_API_BASE}/competitions/${competitionId}/divisions`,
        tenantHost,
        options,
    );
    assertArray(payload, `competition ${competitionId} divisions`);
    return payload.map(parseDivision);
}

export async function discoverTTLeaguesArchives(
    baseUrl: string,
    options: TTLeaguesDiscoveryOptions = {},
): Promise<TTLeaguesCompetition[]> {
    const tenantHost = new URL(baseUrl).host;
    const payload = await fetchTTLeaguesJson(
        `${TTLEAGUES_API_BASE}/competitions/archives`,
        tenantHost,
        options,
    );
    assertArray(payload, 'competition archives');
    return payload.map(parseCompetition);
}

export async function discoverTTLeaguesTenant(
    baseUrl: string,
    options: TTLeaguesDiscoveryOptions = {},
): Promise<TTLeaguesTenantDiscovery> {
    const catalogue = await discoverTTLeaguesCompetitions(baseUrl, options);

    if (catalogue.competitions.length === 0) {
        return {
            tenantHost: catalogue.tenantHost,
            status: 'no_active_competition',
            competitions: [],
        };
    }

    const discovered: DiscoveredTTLeaguesCompetition[] = [];
    for (const competition of catalogue.competitions) {
        discovered.push({
            ...competition,
            divisions: await discoverTTLeaguesDivisions(
                catalogue.tenantHost,
                competition.id,
                options,
            ),
        });
    }

    return {
        tenantHost: catalogue.tenantHost,
        status: 'healthy',
        competitions: discovered,
    };
}
