import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { upsertSourceInstance, upsertSourceResource } from './sources/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const CONFIG_PATH = resolve(__dirname, '../config/national-ttleagues.json');

export interface NationalTTLeaguesSource {
    leagueName: string;
    externalId: string;
    baseUrl: string;
    regions: string[];
    historyMaxCompetitions: number;
}

interface TTLeaguesCompetition {
    id: number;
    name: string;
}

interface TTLeaguesDivision {
    id: number;
    name: string;
}

interface Logger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface NationalTTLeaguesOptions {
    includeHistory?: boolean;
    sources?: NationalTTLeaguesSource[];
    logger?: Logger;
    throwOnError?: boolean;
}

function readSources(): NationalTTLeaguesSource[] {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as NationalTTLeaguesSource[];
}

async function fetchJson<T>(url: string, tenantHost: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Tenant: tenantHost,
            Entry: '1',
            'User-Agent': 'tt-players/1.0',
        },
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.json() as Promise<T>;
}

function normalizeRegionSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function upsertPlatform(db: Kysely<Database>): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select('id')
        .where('name', '=', 'TT Leagues')
        .executeTakeFirst();
    if (existing) return existing.id;

    return db
        .insertInto('platforms')
        .values({ name: 'TT Leagues', base_url: TTL_API_BASE })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

async function upsertLeague(
    db: Kysely<Database>,
    platformId: string,
    source: NationalTTLeaguesSource,
): Promise<string> {
    const existing = await db
        .selectFrom('leagues')
        .select(['id', 'name'])
        .where('platform_id', '=', platformId)
        .where('external_id', '=', source.externalId)
        .executeTakeFirst();
    if (existing) {
        if (existing.name !== source.leagueName) {
            await db
                .updateTable('leagues')
                .set({ name: source.leagueName, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    return db
        .insertInto('leagues')
        .values({
            platform_id: platformId,
            external_id: source.externalId,
            name: source.leagueName,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

async function syncRegions(
    db: Kysely<Database>,
    leagueId: string,
    names: string[],
): Promise<void> {
    const regionIds: string[] = [];
    for (const name of Array.from(new Set(names.map((value) => value.trim()).filter(Boolean)))) {
        const slug = normalizeRegionSlug(name);
        let region = await db
            .selectFrom('regions')
            .select(['id', 'name'])
            .where('slug', '=', slug)
            .executeTakeFirst();
        if (!region) {
            region = await db
                .insertInto('regions')
                .values({ slug, name })
                .returning(['id', 'name'])
                .executeTakeFirstOrThrow();
        } else if (region.name !== name) {
            await db.updateTable('regions').set({ name }).where('id', '=', region.id).execute();
        }
        regionIds.push(region.id);
    }

    await db.deleteFrom('league_regions').where('league_id', '=', leagueId).execute();
    if (regionIds.length > 0) {
        await db
            .insertInto('league_regions')
            .values(regionIds.map((regionId) => ({ league_id: leagueId, region_id: regionId })))
            .execute();
    }
}

async function upsertSeason(
    db: Kysely<Database>,
    leagueId: string,
    competition: TTLeaguesCompetition,
    isActive: boolean,
): Promise<string> {
    const externalId = `competition-${competition.id}`;
    const existing = await db
        .selectFrom('seasons')
        .select(['id', 'name', 'is_active'])
        .where('league_id', '=', leagueId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) {
        if (existing.name !== competition.name || existing.is_active !== isActive) {
            await db
                .updateTable('seasons')
                .set({ name: competition.name, is_active: isActive, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    return db
        .insertInto('seasons')
        .values({
            league_id: leagueId,
            external_id: externalId,
            name: competition.name,
            is_active: isActive,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

async function upsertDivision(
    db: Kysely<Database>,
    seasonId: string,
    division: TTLeaguesDivision,
): Promise<string> {
    const externalId = String(division.id);
    const name = division.name || `Division ${division.id}`;
    const existing = await db
        .selectFrom('competitions')
        .select(['id', 'name'])
        .where('season_id', '=', seasonId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) {
        if (existing.name !== name) {
            await db
                .updateTable('competitions')
                .set({ name, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    return db
        .insertInto('competitions')
        .values({ season_id: seasonId, external_id: externalId, name, type: 'league' })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

async function buildSourceTargets(
    db: Kysely<Database>,
    platformId: string,
    source: NationalTTLeaguesSource,
    includeHistory: boolean,
): Promise<ScrapeTarget[]> {
    const tenantHost = new URL(source.baseUrl).host;
    const leagueId = await upsertLeague(db, platformId, source);
    await syncRegions(db, leagueId, source.regions);

    const sourceInstance = await upsertSourceInstance(db, {
        platformId,
        key: source.externalId,
        name: source.leagueName,
        baseUrl: source.baseUrl,
        adapterKey: 'ttleagues',
        config: { nationalBridge: true },
    });

    const activeCompetitions = await fetchJson<TTLeaguesCompetition[]>(
        `${TTL_API_BASE}/competitions`,
        tenantHost,
    );
    const activeById = new Map(activeCompetitions.map((competition) => [competition.id, competition]));

    let historicalCompetitions: TTLeaguesCompetition[] = [];
    if (includeHistory && source.historyMaxCompetitions > 0) {
        const archives = await fetchJson<TTLeaguesCompetition[]>(
            `${TTL_API_BASE}/competitions/archives`,
            tenantHost,
        );
        historicalCompetitions = archives
            .filter((competition) => !activeById.has(competition.id))
            .sort((a, b) => b.id - a.id)
            .slice(0, source.historyMaxCompetitions);
    }

    const targets: ScrapeTarget[] = [];
    const activeSeasonIds: string[] = [];
    for (const { competition, isActive } of [
        ...activeCompetitions.map((competition) => ({ competition, isActive: true })),
        ...historicalCompetitions.map((competition) => ({ competition, isActive: false })),
    ]) {
        const seasonId = await upsertSeason(db, leagueId, competition, isActive);
        if (isActive) activeSeasonIds.push(seasonId);
        const divisions = await fetchJson<TTLeaguesDivision[]>(
            `${TTL_API_BASE}/competitions/${competition.id}/divisions`,
            tenantHost,
        );

        for (const division of divisions) {
            const canonicalCompetitionId = await upsertDivision(db, seasonId, division);
            const divisionId = String(division.id);
            const divisionName = division.name || `Division ${division.id}`;
            const standingsUrl = `${TTL_API_BASE}/divisions/${division.id}/standings`;

            await upsertSourceResource(db, {
                sourceInstanceId: sourceInstance.id,
                resourceType: 'standings',
                externalId: `${competition.id}:${division.id}:standings`,
                adapterVersion: 'ttleagues-v1',
                name: `${competition.name} / ${divisionName} standings`,
                publicUrl: source.baseUrl,
                refreshPolicy: { cadence: isActive ? 'daily' : 'historical', isHistorical: !isActive },
                leagueId,
                seasonId,
                competitionId: canonicalCompetitionId,
            });
            await upsertSourceResource(db, {
                sourceInstanceId: sourceInstance.id,
                resourceType: 'fixtures',
                externalId: `${competition.id}:${division.id}:matches`,
                adapterVersion: 'ttleagues-v1',
                name: `${competition.name} / ${divisionName} matches`,
                publicUrl: source.baseUrl,
                refreshPolicy: { cadence: isActive ? 'daily' : 'historical', isHistorical: !isActive },
                leagueId,
                seasonId,
                competitionId: canonicalCompetitionId,
            });

            targets.push({
                url: standingsUrl,
                fixturesUrl: null,
                tenantHost,
                platformId,
                platformType: 'ttleagues',
                competitionId: canonicalCompetitionId,
                divisionExtId: divisionId,
                divisionName,
                leagueName: source.leagueName,
                isHistorical: !isActive,
            });
        }
    }

    if (activeSeasonIds.length > 0) {
        await db
            .updateTable('seasons')
            .set({ is_active: false })
            .where('league_id', '=', leagueId)
            .where('id', 'not in', activeSeasonIds)
            .execute();
    }

    return targets;
}

export async function bootstrapNationalTTLeagues(
    db: Kysely<Database>,
    options: NationalTTLeaguesOptions = {},
): Promise<ScrapeTarget[]> {
    const sources = options.sources ?? readSources();
    const platformId = await upsertPlatform(db);
    const targets: ScrapeTarget[] = [];

    for (const source of sources) {
        try {
            const sourceTargets = await buildSourceTargets(
                db,
                platformId,
                source,
                options.includeHistory ?? false,
            );
            targets.push(...sourceTargets);
            options.logger?.info?.(
                `bootstrapNationalTTLeagues: ${source.leagueName} resolved ${sourceTargets.length} targets`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            options.logger?.warn?.(
                `bootstrapNationalTTLeagues: skipping ${source.leagueName}: ${message}`,
            );
            if (options.throwOnError) throw error;
        }
    }

    return targets;
}

export const __internal = {
    readSources,
    normalizeRegionSlug,
};
