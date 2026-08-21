import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import {
    recordSourceInstanceDiscovery,
    upsertSourceInstance,
    upsertSourceResource,
} from './sources/registry.js';
import {
    discoverTTLeaguesArchives,
    discoverTTLeaguesDivisions,
    discoverTTLeaguesTenant,
    TTLEAGUES_API_BASE,
    type TTLeaguesCompetition,
    type TTLeaguesDivision,
} from './ttleagues-discovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../config/national-ttleagues.json');
const CURRENT_SEASON_EXTERNAL_ID = 'current-national-competitions';
const CURRENT_SEASON_NAME = 'Current national competitions';

export interface NationalTTLeaguesSource {
    leagueName: string;
    externalId: string;
    baseUrl: string;
    regions: string[];
    historyMaxCompetitions: number;
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

    const row = await db
        .insertInto('platforms')
        .values({ name: 'TT Leagues', base_url: TTLEAGUES_API_BASE })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
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

    const row = await db
        .insertInto('leagues')
        .values({
            platform_id: platformId,
            external_id: source.externalId,
            name: source.leagueName,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
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
                .set({ name, is_active: isActive, deleted_at: null })
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

async function upsertDivision(
    db: Kysely<Database>,
    leagueId: string,
    seasonId: string,
    upstreamCompetition: TTLeaguesCompetition,
    division: TTLeaguesDivision,
): Promise<string> {
    const externalId = `${upstreamCompetition.id}:${division.id}`;
    const divisionName = division.name || `Division ${division.id}`;
    const name = `${upstreamCompetition.name} — ${divisionName}`;
    const existing = await db
        .selectFrom('competitions as competition')
        .innerJoin('seasons as season', 'season.id', 'competition.season_id')
        .select(['competition.id', 'competition.name', 'competition.season_id'])
        .where('season.league_id', '=', leagueId)
        .where('competition.external_id', '=', externalId)
        .executeTakeFirst();

    if (existing) {
        if (existing.name !== name || existing.season_id !== seasonId) {
            await db
                .updateTable('competitions')
                .set({ season_id: seasonId, name, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        } else {
            await db
                .updateTable('competitions')
                .set({ deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    const row = await db
        .insertInto('competitions')
        .values({ season_id: seasonId, external_id: externalId, name, type: 'league' })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function registerDivisionResources(
    db: Kysely<Database>,
    sourceInstanceId: string,
    source: NationalTTLeaguesSource,
    leagueId: string,
    seasonId: string,
    canonicalCompetitionId: string,
    upstreamCompetition: TTLeaguesCompetition,
    division: TTLeaguesDivision,
    isHistorical: boolean,
): Promise<void> {
    const divisionName = division.name || `Division ${division.id}`;
    const shared = {
        sourceInstanceId,
        adapterVersion: 'ttleagues-v1',
        publicUrl: source.baseUrl,
        refreshPolicy: {
            cadence: isHistorical ? 'historical' : 'daily',
            isHistorical,
        },
        lifecycle: isHistorical ? 'historical' as const : 'active' as const,
        leagueId,
        seasonId,
        competitionId: canonicalCompetitionId,
        enabled: true,
    };

    await upsertSourceResource(db, {
        ...shared,
        resourceType: 'standings',
        externalId: `${upstreamCompetition.id}:${division.id}:standings`,
        name: `${upstreamCompetition.name} / ${divisionName} standings`,
    });
    await upsertSourceResource(db, {
        ...shared,
        resourceType: 'fixtures',
        externalId: `${upstreamCompetition.id}:${division.id}:matches`,
        name: `${upstreamCompetition.name} / ${divisionName} matches`,
    });
}

async function markStaleResourcesHistorical(
    db: Kysely<Database>,
    sourceInstanceId: string,
    seasonId: string,
    activeCanonicalCompetitionIds: string[],
): Promise<void> {
    if (activeCanonicalCompetitionIds.length === 0) return;

    const staleCurrent = await db
        .selectFrom('competitions')
        .select('id')
        .where('season_id', '=', seasonId)
        .where('deleted_at', 'is', null)
        .where('id', 'not in', activeCanonicalCompetitionIds)
        .execute();

    if (staleCurrent.length === 0) return;
    const staleIds = staleCurrent.map((row) => row.id);
    await db
        .updateTable('source_resources')
        .set({
            lifecycle: 'historical',
            refresh_policy: { cadence: 'historical', isHistorical: true },
            updated_at: new Date(),
        })
        .where('source_instance_id', '=', sourceInstanceId)
        .where('competition_id', 'in', staleIds)
        .execute();
}

async function buildSourceTargets(
    db: Kysely<Database>,
    platformId: string,
    source: NationalTTLeaguesSource,
    includeHistory: boolean,
): Promise<ScrapeTarget[]> {
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

    let discovery;
    try {
        discovery = await discoverTTLeaguesTenant(source.baseUrl);
    } catch (error) {
        await recordSourceInstanceDiscovery(db, sourceInstance.id, {
            status: 'failed',
            error,
        });
        throw error;
    }

    const competitionIds = discovery.competitions.map((competition) => competition.id);
    const divisionCount = discovery.competitions.reduce(
        (count, competition) => count + competition.divisions.length,
        0,
    );
    await recordSourceInstanceDiscovery(db, sourceInstance.id, {
        status: discovery.status,
        metadata: {
            competitionIds,
            competitionCount: competitionIds.length,
            divisionCount,
        },
    });

    if (discovery.status === 'no_active_competition') {
        return [];
    }

    const currentSeasonId = await upsertSeason(
        db,
        leagueId,
        CURRENT_SEASON_EXTERNAL_ID,
        CURRENT_SEASON_NAME,
        true,
    );
    await db
        .updateTable('seasons')
        .set({ is_active: false })
        .where('league_id', '=', leagueId)
        .where('id', '!=', currentSeasonId)
        .execute();

    const activeById = new Set(discovery.competitions.map((competition) => competition.id));
    let historicalCompetitions: TTLeaguesCompetition[] = [];
    if (includeHistory && source.historyMaxCompetitions > 0) {
        const archives = await discoverTTLeaguesArchives(source.baseUrl);
        historicalCompetitions = archives
            .filter((competition) => !activeById.has(competition.id))
            .sort((a, b) => b.id - a.id)
            .slice(0, source.historyMaxCompetitions);
    }

    const targets: ScrapeTarget[] = [];
    const activeCanonicalCompetitionIds: string[] = [];

    for (const upstreamCompetition of discovery.competitions) {
        for (const division of upstreamCompetition.divisions) {
            const canonicalCompetitionId = await upsertDivision(
                db,
                leagueId,
                currentSeasonId,
                upstreamCompetition,
                division,
            );
            activeCanonicalCompetitionIds.push(canonicalCompetitionId);
            await registerDivisionResources(
                db,
                sourceInstance.id,
                source,
                leagueId,
                currentSeasonId,
                canonicalCompetitionId,
                upstreamCompetition,
                division,
                false,
            );
            targets.push({
                url: `${TTLEAGUES_API_BASE}/divisions/${division.id}/standings`,
                fixturesUrl: null,
                tenantHost: discovery.tenantHost,
                platformId,
                platformType: 'ttleagues',
                competitionId: canonicalCompetitionId,
                divisionExtId: String(division.id),
                divisionName: `${upstreamCompetition.name} — ${division.name || `Division ${division.id}`}`,
                leagueName: source.leagueName,
                isHistorical: false,
            });
        }
    }

    await markStaleResourcesHistorical(
        db,
        sourceInstance.id,
        currentSeasonId,
        activeCanonicalCompetitionIds,
    );

    for (const upstreamCompetition of historicalCompetitions) {
        const historicalSeasonId = await upsertSeason(
            db,
            leagueId,
            `competition-${upstreamCompetition.id}`,
            upstreamCompetition.name,
            false,
        );
        const divisions = await discoverTTLeaguesDivisions(
            discovery.tenantHost,
            upstreamCompetition.id,
        );
        for (const division of divisions) {
            const canonicalCompetitionId = await upsertDivision(
                db,
                leagueId,
                historicalSeasonId,
                upstreamCompetition,
                division,
            );
            await registerDivisionResources(
                db,
                sourceInstance.id,
                source,
                leagueId,
                historicalSeasonId,
                canonicalCompetitionId,
                upstreamCompetition,
                division,
                true,
            );
            targets.push({
                url: `${TTLEAGUES_API_BASE}/divisions/${division.id}/standings`,
                fixturesUrl: null,
                tenantHost: discovery.tenantHost,
                platformId,
                platformType: 'ttleagues',
                competitionId: canonicalCompetitionId,
                divisionExtId: String(division.id),
                divisionName: `${upstreamCompetition.name} — ${division.name || `Division ${division.id}`}`,
                leagueName: source.leagueName,
                isHistorical: true,
            });
        }
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
