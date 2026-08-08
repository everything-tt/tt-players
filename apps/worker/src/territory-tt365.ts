import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import {
    readTerritoryManifests,
    type TerritoryManifest,
    type TerritorySourceConfig,
} from './territory-source-catalog.js';

const TT365_BASE = 'https://www.tabletennis365.com';

export interface TerritoryTT365DivisionSeed {
    name: string;
    season: string;
    slug: string;
}

export interface TerritoryTT365Seed {
    territory: string;
    sourceKey: string;
    sourceName: string;
    baseUrl: string;
    leagueExternalId: string;
    seasonName: string;
    seasonExtId: string;
    regions: string[];
    divisions: TerritoryTT365DivisionSeed[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
    return value as string[];
}

function parseDivision(value: unknown): TerritoryTT365DivisionSeed | null {
    if (!isRecord(value)) return null;
    const { name, season, slug } = value;
    if (typeof name !== 'string' || typeof season !== 'string' || typeof slug !== 'string') return null;
    if (!name.trim() || !season.trim() || !slug.trim()) return null;
    return { name, season, slug };
}

function parseSeed(
    territory: string,
    source: TerritorySourceConfig,
): TerritoryTT365Seed | null {
    if (source.adapterKey !== 'tt365' || source.status !== 'active') return null;
    const raw = source.config?.['tt365Scrape'];
    if (!isRecord(raw)) return null;

    const leagueExternalId = raw['leagueExternalId'];
    const seasonName = raw['seasonName'];
    const seasonExtId = raw['seasonExtId'];
    const regions = stringArray(raw['regions']);
    const rawDivisions = raw['divisions'];
    if (
        typeof leagueExternalId !== 'string'
        || typeof seasonName !== 'string'
        || typeof seasonExtId !== 'string'
        || !regions
        || !Array.isArray(rawDivisions)
    ) {
        throw new Error(`Invalid tt365Scrape config for territory source ${source.key}`);
    }

    const divisions = rawDivisions.map(parseDivision);
    if (divisions.length === 0 || divisions.some((division) => division === null)) {
        throw new Error(`Invalid tt365Scrape divisions for territory source ${source.key}`);
    }

    return {
        territory,
        sourceKey: source.key,
        sourceName: source.name,
        baseUrl: source.baseUrl.replace(/\/+$/, ''),
        leagueExternalId,
        seasonName,
        seasonExtId,
        regions,
        divisions: divisions as TerritoryTT365DivisionSeed[],
    };
}

export function collectTerritoryTT365Seeds(
    manifests: TerritoryManifest[] = readTerritoryManifests(),
): TerritoryTT365Seed[] {
    return manifests.flatMap((manifest) =>
        manifest.sources.flatMap((source) => {
            const seed = parseSeed(manifest.territory, source);
            return seed ? [seed] : [];
        }),
    );
}

function normalizeRegionSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function ensurePlatform(db: Kysely<Database>): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select('id')
        .where('name', '=', 'TableTennis365')
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('platforms')
        .values({ name: 'TableTennis365', base_url: TT365_BASE })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function ensureLeague(
    db: Kysely<Database>,
    platformId: string,
    seed: TerritoryTT365Seed,
): Promise<string> {
    const existing = await db
        .selectFrom('leagues')
        .select(['id', 'name'])
        .where('platform_id', '=', platformId)
        .where('external_id', '=', seed.leagueExternalId)
        .executeTakeFirst();

    if (existing) {
        if (existing.name !== seed.sourceName) {
            await db
                .updateTable('leagues')
                .set({ name: seed.sourceName, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    const row = await db
        .insertInto('leagues')
        .values({
            platform_id: platformId,
            external_id: seed.leagueExternalId,
            name: seed.sourceName,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function syncRegions(
    db: Kysely<Database>,
    leagueId: string,
    regions: string[],
): Promise<void> {
    const regionIds: string[] = [];
    for (const name of Array.from(new Set(regions.map((value) => value.trim()).filter(Boolean)))) {
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

async function ensureSeason(
    db: Kysely<Database>,
    leagueId: string,
    seed: TerritoryTT365Seed,
): Promise<string> {
    const existing = await db
        .selectFrom('seasons')
        .select(['id', 'name', 'is_active'])
        .where('league_id', '=', leagueId)
        .where('external_id', '=', seed.seasonExtId)
        .executeTakeFirst();

    let seasonId: string;
    if (existing) {
        seasonId = existing.id;
        if (existing.name !== seed.seasonName || !existing.is_active) {
            await db
                .updateTable('seasons')
                .set({ name: seed.seasonName, is_active: true, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
    } else {
        const row = await db
            .insertInto('seasons')
            .values({
                league_id: leagueId,
                external_id: seed.seasonExtId,
                name: seed.seasonName,
                is_active: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        seasonId = row.id;
    }

    await db
        .updateTable('seasons')
        .set({ is_active: false })
        .where('league_id', '=', leagueId)
        .where('id', '!=', seasonId)
        .execute();
    return seasonId;
}

async function ensureCompetition(
    db: Kysely<Database>,
    seasonId: string,
    division: TerritoryTT365DivisionSeed,
): Promise<string> {
    const externalId = division.slug.toLowerCase();
    const existing = await db
        .selectFrom('competitions')
        .select(['id', 'name'])
        .where('season_id', '=', seasonId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();

    if (existing) {
        if (existing.name !== division.name) {
            await db
                .updateTable('competitions')
                .set({ name: division.name, deleted_at: null })
                .where('id', '=', existing.id)
                .execute();
        }
        return existing.id;
    }

    const row = await db
        .insertInto('competitions')
        .values({
            season_id: seasonId,
            external_id: externalId,
            name: division.name,
            type: 'league',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function bootstrapTerritoryTT365Targets(
    db: Kysely<Database>,
): Promise<ScrapeTarget[]> {
    const seeds = collectTerritoryTT365Seeds();
    if (seeds.length === 0) return [];

    const platformId = await ensurePlatform(db);
    const targets: ScrapeTarget[] = [];

    for (const seed of seeds) {
        const leagueId = await ensureLeague(db, platformId, seed);
        await syncRegions(db, leagueId, seed.regions);
        const seasonId = await ensureSeason(db, leagueId, seed);

        for (const division of seed.divisions) {
            const competitionId = await ensureCompetition(db, seasonId, division);
            targets.push({
                url: `${seed.baseUrl}/Tables/${division.season}/${division.slug}`,
                fixturesUrl: `${seed.baseUrl}/Fixtures/${division.season}/${division.slug}`,
                tenantHost: null,
                platformId,
                platformType: 'tt365',
                competitionId,
                divisionExtId: division.slug.toLowerCase(),
                divisionName: division.name,
                leagueName: seed.sourceName,
                isHistorical: false,
            });
        }
    }

    return targets;
}
