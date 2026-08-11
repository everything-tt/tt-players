/**
 * Bootstrap module: reads leagues.json config, ensures all
 * Platform → League → Season → Competition rows exist in the DB,
 * and returns a flat list of scrape targets for the worker to queue.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { fetchWithTT365Policy } from './tt365-http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface TT365Division {
    name: string;
    season: string;   // e.g. "Winter_2025"
    slug: string;     // e.g. "Premier_Division"
}

export interface TTLeaguesDivision {
    name: string;
    divisionId: number;
}

export interface HistoryConfig {
    enabled?: boolean;
    maxSeasons?: number;
    includeCups?: boolean;
}

export interface LeagueConfig {
    platform: 'tt365' | 'ttleagues';
    leagueName: string;
    externalId: string;
    seasonName: string;
    seasonExtId: string;
    baseUrl: string;
    divisions: (TT365Division | TTLeaguesDivision)[];
    history?: HistoryConfig;
    regions?: string[];
}

// ─── Output: scrape target ────────────────────────────────────────────────────

export interface ScrapeTarget {
    url: string;
    fixturesUrl: string | null;
    tenantHost: string | null;
    platformId: string;
    platformType: 'tt365' | 'ttleagues';
    competitionId: string;
    divisionExtId: string;   // TT Leagues divisionId or TT365 slug
    divisionName: string;
    leagueName: string;
    isHistorical: boolean;
}

export interface BootstrapOptions {
    includeHistory?: boolean;
    leagueNames?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TT365_BASE = 'https://www.tabletennis365.com';
const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const DEFAULT_HISTORY_MAX_SEASONS = 3;
const CUP_NAME_PATTERN = /\b(cup|knockout|ko|trophy|plate|shield)\b/i;
const CONFIG_FILES = [
    '../config/leagues.json',
    '../config/uk-leagues.generated.json',
];

interface TT365ArchiveSeason {
    seasonToken: string;
    seasonName: string;
}

interface HistoricalSeasonTarget {
    seasonName: string;
    seasonExtId: string;
    divisionName: string;
    divisionExtId: string;
    standingsUrl: string;
    fixturesUrl: string | null;
}

interface TTLeaguesCompetition {
    id: number;
    name: string;
}

interface TTLeaguesDiscoveredDivision {
    id: number;
    name: string;
}

function normalizeExternalId(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeRegionSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function titleCaseFromSlug(slug: string): string {
    return slug
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getLeaguePathSegment(baseUrl: string): string {
    const pathname = new URL(baseUrl).pathname;
    const segment = pathname.split('/').filter(Boolean)[0];
    if (!segment) {
        throw new Error(`Invalid baseUrl for league config: ${baseUrl}`);
    }
    return segment;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const res = await fetchWithTT365Policy(url, { headers });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return res.text();
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetchWithTT365Policy(url, { headers });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return res.json() as Promise<T>;
}

function parseTT365ArchiveSeasons(
    html: string,
    baseUrl: string,
): TT365ArchiveSeason[] {
    const $ = cheerio.load(html);
    const leagueSegment = getLeaguePathSegment(baseUrl).toLowerCase();
    const seen = new Set<string>();
    const seasons: TT365ArchiveSeason[] = [];

    $('a[href*="/Results/Categories/"]').each((_i, a) => {
        const href = $(a).attr('href');
        if (!href) return;

        let pathname: string;
        try {
            pathname = new URL(href, baseUrl).pathname;
        } catch {
            return;
        }

        const segments = pathname.split('/').filter(Boolean);
        if (segments.length < 4) return;
        if (segments[0].toLowerCase() !== leagueSegment) return;
        if (segments[1].toLowerCase() !== 'results') return;
        if (segments[2].toLowerCase() !== 'categories') return;

        const seasonToken = decodeURIComponent(segments[3]);
        if (!seasonToken || seen.has(seasonToken.toLowerCase())) return;
        seen.add(seasonToken.toLowerCase());

        const seasonName = $(a).text().trim() || seasonToken.replace(/_/g, ' ');
        seasons.push({ seasonToken, seasonName });
    });

    return seasons;
}

function parseTT365DivisionIndex(
    html: string,
    baseUrl: string,
    seasonToken: string,
    mode: 'fixtures' | 'tables',
): Array<{ slug: string; name: string }> {
    const $ = cheerio.load(html);
    const leagueSegment = getLeaguePathSegment(baseUrl).toLowerCase();
    const modeSegment = mode.toLowerCase();
    const tokenLower = seasonToken.toLowerCase();
    const seen = new Set<string>();
    const divisions: Array<{ slug: string; name: string }> = [];

    $('a[href]').each((_i, a) => {
        const href = $(a).attr('href');
        if (!href) return;

        let pathname: string;
        try {
            pathname = new URL(href, baseUrl).pathname;
        } catch {
            return;
        }

        const segments = pathname.split('/').filter(Boolean);
        if (segments.length < 4) return;
        if (segments[0].toLowerCase() !== leagueSegment) return;
        if (segments[1].toLowerCase() !== modeSegment) return;
        if (decodeURIComponent(segments[2]).toLowerCase() !== tokenLower) return;

        const slug = decodeURIComponent(segments[3]);
        if (!slug || slug.toLowerCase() === 'all_divisions') return;
        if (seen.has(slug.toLowerCase())) return;
        seen.add(slug.toLowerCase());

        const name = $(a).text().trim() || titleCaseFromSlug(slug);
        divisions.push({ slug, name });
    });

    return divisions;
}

async function discoverTT365HistoricalTargets(
    league: LeagueConfig,
): Promise<HistoricalSeasonTarget[]> {
    const include = league.history?.enabled ?? false;
    if (!include) return [];

    const archiveHtml = await fetchText(`${league.baseUrl}/Results/Archive`);
    const archiveSeasons = parseTT365ArchiveSeasons(archiveHtml, league.baseUrl);
    const configuredSeasonTokens = new Set(
        (league.divisions as TT365Division[]).map((d) => d.season.toLowerCase()),
    );

    const maxSeasons = league.history?.maxSeasons ?? DEFAULT_HISTORY_MAX_SEASONS;
    const selectedSeasons = archiveSeasons
        .filter((s) => !configuredSeasonTokens.has(s.seasonToken.toLowerCase()))
        .slice(0, Math.max(0, maxSeasons));

    const targets: HistoricalSeasonTarget[] = [];

    for (const season of selectedSeasons) {
        const fixturesIndexUrl = `${league.baseUrl}/Fixtures/${season.seasonToken}`;
        const tablesIndexUrl = `${league.baseUrl}/Tables/${season.seasonToken}`;

        let divisions: Array<{ slug: string; name: string }> = [];
        try {
            const fixturesHtml = await fetchText(fixturesIndexUrl);
            divisions = parseTT365DivisionIndex(
                fixturesHtml,
                league.baseUrl,
                season.seasonToken,
                'fixtures',
            );
        } catch {
            // fall back to tables index if fixtures index is unavailable
        }

        if (divisions.length === 0) {
            try {
                const tablesHtml = await fetchText(tablesIndexUrl);
                divisions = parseTT365DivisionIndex(
                    tablesHtml,
                    league.baseUrl,
                    season.seasonToken,
                    'tables',
                );
            } catch {
                // no valid index page for this season, skip
            }
        }

        for (const division of divisions) {
            targets.push({
                seasonName: season.seasonName,
                seasonExtId: normalizeExternalId(season.seasonToken),
                divisionName: division.name,
                divisionExtId: division.slug.toLowerCase(),
                standingsUrl: `${league.baseUrl}/Tables/${season.seasonToken}/${division.slug}`,
                fixturesUrl: `${league.baseUrl}/Fixtures/${season.seasonToken}/${division.slug}`,
            });
        }
    }

    return targets;
}

async function discoverTTLeaguesHistoricalTargets(
    league: LeagueConfig,
): Promise<HistoricalSeasonTarget[]> {
    const include = league.history?.enabled ?? false;
    if (!include) return [];

    const tenantHost = new URL(league.baseUrl).host;
    const headers = {
        Tenant: tenantHost,
        Entry: '1',
    };

    const [competitions, archivedCompetitions] = await Promise.all([
        fetchJson<TTLeaguesCompetition[]>(`${TTL_API_BASE}/competitions`, headers),
        fetchJson<TTLeaguesCompetition[]>(`${TTL_API_BASE}/competitions/archives`, headers),
    ]);

    const competitionById = new Map<number, TTLeaguesCompetition>();
    for (const c of competitions) competitionById.set(c.id, c);
    for (const c of archivedCompetitions) competitionById.set(c.id, c);

    const includeCups = league.history?.includeCups ?? false;
    let mergedCompetitions = Array.from(competitionById.values())
        .filter((c) => includeCups || !CUP_NAME_PATTERN.test(c.name))
        .sort((a, b) => b.id - a.id);

    const maxSeasons = league.history?.maxSeasons ?? DEFAULT_HISTORY_MAX_SEASONS;
    mergedCompetitions = mergedCompetitions.slice(0, Math.max(0, maxSeasons));

    const configuredDivisionIds = new Set(
        (league.divisions as TTLeaguesDivision[]).map((d) => d.divisionId),
    );

    const targets: HistoricalSeasonTarget[] = [];
    for (const competition of mergedCompetitions) {
        const divisions = await fetchJson<TTLeaguesDiscoveredDivision[]>(
            `${TTL_API_BASE}/competitions/${competition.id}/divisions`,
            headers,
        );

        for (const division of divisions) {
            if (configuredDivisionIds.has(division.id)) continue;

            targets.push({
                seasonName: competition.name,
                seasonExtId: `competition-${competition.id}`,
                divisionName: division.name || `Division ${division.id}`,
                divisionExtId: String(division.id),
                standingsUrl: `${TTL_API_BASE}/divisions/${division.id}/standings`,
                fixturesUrl: null,
            });
        }
    }

    return targets;
}

export function readLegacyLeagueConfigs(): LeagueConfig[] {
    const merged = new Map<string, LeagueConfig>();

    for (const relativePath of CONFIG_FILES) {
        const configPath = resolve(__dirname, relativePath);
        let parsed: LeagueConfig[];

        try {
            parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as LeagueConfig[];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/no such file/i.test(message)) continue;
            throw error;
        }

        for (const league of parsed) {
            if (!merged.has(league.externalId)) {
                merged.set(league.externalId, league);
            }
        }
    }

    return Array.from(merged.values());
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Reads leagues.json, upserts DB records, and returns scrape targets.
 * This is idempotent — safe to call on every worker startup.
 */
export async function bootstrapLeagueConfigs(
    db: Kysely<Database>,
    leagueConfigs: LeagueConfig[],
    options: BootstrapOptions = {},
): Promise<ScrapeTarget[]> {
    const { includeHistory = false, leagueNames } = options;
    const leagueNameFilter = leagueNames && leagueNames.length > 0
        ? new Set(leagueNames)
        : null;
    const leagues = leagueConfigs.filter((league) =>
        leagueNameFilter ? leagueNameFilter.has(league.leagueName) : true,
    );

    const targets: ScrapeTarget[] = [];

    for (const league of leagues) {
        // ── 1. Upsert Platform ────────────────────────────────────────────
        const platformName = league.platform === 'tt365' ? 'TableTennis365' : 'TT Leagues';
        const platformBaseUrl = league.platform === 'tt365' ? TT365_BASE : TTL_API_BASE;

        const platformId = await upsertPlatform(db, platformName, platformBaseUrl);

        // ── 2. Upsert League ──────────────────────────────────────────────
        const leagueId = await upsertLeague(db, platformId, league.externalId, league.leagueName);
        await syncLeagueRegions(db, leagueId, league.regions ?? []);

        // ── 3. Upsert current season ──────────────────────────────────────
        const seasonId = await upsertSeason(
            db,
            leagueId,
            league.seasonExtId,
            league.seasonName,
            true,
        );
        await markOtherSeasonsInactive(db, leagueId, seasonId);

        // ── 4. Upsert configured divisions (active season) ───────────────
        for (const div of league.divisions) {
            let divExtId: string;
            let standingsUrl: string;
            let fixturesUrl: string | null = null;

            if (league.platform === 'tt365') {
                const d = div as TT365Division;
                divExtId = d.slug.toLowerCase();
                standingsUrl = `${league.baseUrl}/Tables/${d.season}/${d.slug}`;
                fixturesUrl = `${league.baseUrl}/Fixtures/${d.season}/${d.slug}`;
            } else {
                const d = div as TTLeaguesDivision;
                divExtId = String(d.divisionId);
                standingsUrl = `${TTL_API_BASE}/divisions/${d.divisionId}/standings`;
            }

            const competitionId = await upsertCompetition(db, seasonId, divExtId, div.name);

            targets.push({
                url: standingsUrl,
                fixturesUrl,
                tenantHost: league.platform === 'ttleagues' ? new URL(league.baseUrl).host : null,
                platformId,
                platformType: league.platform,
                competitionId,
                divisionExtId: divExtId,
                divisionName: div.name,
                leagueName: league.leagueName,
                isHistorical: false,
            });
        }

        if (!includeHistory) continue;

        const discoveredHistory = league.platform === 'tt365'
            ? await discoverTT365HistoricalTargets(league)
            : await discoverTTLeaguesHistoricalTargets(league);

        const seasonIdCache = new Map<string, string>();
        for (const historicalTarget of discoveredHistory) {
            let historicalSeasonId = seasonIdCache.get(historicalTarget.seasonExtId);
            if (!historicalSeasonId) {
                historicalSeasonId = await upsertSeason(
                    db,
                    leagueId,
                    historicalTarget.seasonExtId,
                    historicalTarget.seasonName,
                    false,
                );
                seasonIdCache.set(historicalTarget.seasonExtId, historicalSeasonId);
            }

            const historicalCompetitionId = await upsertCompetition(
                db,
                historicalSeasonId,
                historicalTarget.divisionExtId,
                historicalTarget.divisionName,
            );

            targets.push({
                url: historicalTarget.standingsUrl,
                fixturesUrl: historicalTarget.fixturesUrl,
                tenantHost: league.platform === 'ttleagues' ? new URL(league.baseUrl).host : null,
                platformId,
                platformType: league.platform,
                competitionId: historicalCompetitionId,
                divisionExtId: historicalTarget.divisionExtId,
                divisionName: historicalTarget.divisionName,
                leagueName: league.leagueName,
                isHistorical: true,
            });
        }
    }

    return targets;
}

/**
 * Backwards-compatible configured bootstrap entry point. Operational callers,
 * including maintenance scripts, resolve territory-owned configs through the shared
 * configured target resolver. Legacy parity remains available via
 * readLegacyLeagueConfigs + bootstrapLeagueConfigs.
 */
export async function bootstrap(
    db: Kysely<Database>,
    options: BootstrapOptions = {},
): Promise<ScrapeTarget[]> {
    const { resolveConfiguredLeagueTargets } = await import('./all-scrape-targets.js');
    return resolveConfiguredLeagueTargets(db, options);
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertPlatform(db: Kysely<Database>, name: string, baseUrl: string): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select('id')
        .where('name', '=', name)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('platforms')
        .values({ name, base_url: baseUrl })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function upsertLeague(
    db: Kysely<Database>,
    platformId: string,
    externalId: string,
    name: string,
): Promise<string> {
    const existing = await db
        .selectFrom('leagues')
        .select('id')
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('leagues')
        .values({ platform_id: platformId, external_id: externalId, name })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function upsertRegion(
    db: Kysely<Database>,
    name: string,
): Promise<string> {
    const slug = normalizeRegionSlug(name);
    const existing = await db
        .selectFrom('regions')
        .select(['id', 'name'])
        .where('slug', '=', slug)
        .executeTakeFirst();

    if (existing) {
        if (existing.name !== name) {
            await db
                .updateTable('regions')
                .set({ name })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    const row = await db
        .insertInto('regions')
        .values({ slug, name })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function syncLeagueRegions(
    db: Kysely<Database>,
    leagueId: string,
    regionNames: string[],
): Promise<void> {
    const uniqueRegionNames = Array.from(new Set(
        regionNames
            .map((name) => name.trim())
            .filter((name) => name.length > 0),
    ));

    const regionIds: string[] = [];
    for (const regionName of uniqueRegionNames) {
        regionIds.push(await upsertRegion(db, regionName));
    }

    const existingLinks = await db
        .selectFrom('league_regions')
        .select(['id', 'region_id'])
        .where('league_id', '=', leagueId)
        .execute();

    const existingRegionIds = new Set(existingLinks.map((row) => row.region_id));
    for (const regionId of regionIds) {
        if (existingRegionIds.has(regionId)) continue;
        await db
            .insertInto('league_regions')
            .values({
                league_id: leagueId,
                region_id: regionId,
            })
            .execute();
    }

    if (regionIds.length === 0) {
        await db
            .deleteFrom('league_regions')
            .where('league_id', '=', leagueId)
            .execute();
        return;
    }

    await db
        .deleteFrom('league_regions')
        .where('league_id', '=', leagueId)
        .where('region_id', 'not in', regionIds)
        .execute();
}

async function upsertSeason(
    db: Kysely<Database>,
    leagueId: string,
    externalId: string,
    name: string,
    isActive: boolean,
): Promise<string> {
    const existing = await db
        .selectFrom('seasons')
        .select(['id', 'name', 'is_active'])
        .where('league_id', '=', leagueId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();

    if (existing) {
        if (existing.name !== name || existing.is_active !== isActive) {
            await db
                .updateTable('seasons')
                .set({
                    name,
                    is_active: isActive,
                })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    const row = await db
        .insertInto('seasons')
        .values({ league_id: leagueId, external_id: externalId, name, is_active: isActive })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function markOtherSeasonsInactive(
    db: Kysely<Database>,
    leagueId: string,
    activeSeasonId: string,
): Promise<void> {
    await db
        .updateTable('seasons')
        .set({ is_active: false })
        .where('league_id', '=', leagueId)
        .where('id', '!=', activeSeasonId)
        .execute();
}

async function upsertCompetition(
    db: Kysely<Database>,
    seasonId: string,
    externalId: string,
    name: string,
): Promise<string> {
    const existing = await db
        .selectFrom('competitions')
        .select('id')
        .where('season_id', '=', seasonId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('competitions')
        .values({ season_id: seasonId, external_id: externalId, name, type: 'league' })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export const __internal = {
    normalizeExternalId,
    parseTT365ArchiveSeasons,
    parseTT365DivisionIndex,
};
