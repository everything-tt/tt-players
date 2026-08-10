import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type {
    HistoryConfig,
    LeagueConfig,
    TT365Division,
    TTLeaguesDivision,
} from './bootstrap.js';
import { SOURCE_RESOURCE_TYPES, type SourceResourceType } from './sources/adapter.js';
import { upsertSourceInstance, upsertSourceResource } from './sources/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TERRITORY_CONFIG_DIR = resolve(__dirname, '../config/territories');
const RESOURCE_TYPES = new Set<string>(SOURCE_RESOURCE_TYPES);
const SOURCE_STATUSES = new Set<string>(['active', 'discovery', 'blocked', 'external']);
const INGESTION_MODES = new Set<string>(['catalog-only', 'legacy-config', 'league-config']);
const TT365_PLATFORM_NAME = 'TableTennis365';
const TT365_PLATFORM_BASE_URL = 'https://www.tabletennis365.com';
const TTLEAGUES_PLATFORM_NAME = 'TT Leagues';
const TTLEAGUES_PLATFORM_BASE_URL = 'https://ttleagues-api.azurewebsites.net/api';
const TERRITORY_MANAGED_BY = 'territory-manifest';
const BOOTSTRAP_CONCURRENCY = 10;

export type TerritorySourceStatus = 'active' | 'discovery' | 'blocked' | 'external';
export type TerritoryIngestionMode = 'catalog-only' | 'legacy-config' | 'league-config';

export interface TerritoryCatalogOnlyIngestionConfig {
    mode: 'catalog-only';
}

export interface TerritoryLegacyIngestionConfig {
    mode: 'legacy-config';
    legacyLeagueName: string;
}

export interface TerritoryLeagueIngestionConfig {
    mode: 'league-config';
    externalId: string;
    seasonName: string;
    seasonExtId: string;
    history?: HistoryConfig;
    regions?: string[];
    divisions: Array<TT365Division | TTLeaguesDivision>;
}

export type TerritoryIngestionConfig =
    | TerritoryCatalogOnlyIngestionConfig
    | TerritoryLegacyIngestionConfig
    | TerritoryLeagueIngestionConfig;

export interface TerritoryResourceConfig {
    resourceType: SourceResourceType;
    externalId: string;
    name?: string | null;
    publicUrl?: string | null;
    enabled?: boolean;
    refreshPolicy?: unknown;
}

export interface TerritorySourceConfig {
    key: string;
    name: string;
    platformName: string;
    platformBaseUrl: string;
    baseUrl: string;
    adapterKey: string;
    status: TerritorySourceStatus;
    enabled?: boolean;
    ingestion?: TerritoryIngestionConfig;
    notes?: string;
    config?: Record<string, unknown>;
    resources?: TerritoryResourceConfig[];
}

export interface TerritoryManifest {
    territory: string;
    sources: TerritorySourceConfig[];
}

export interface TerritoryCatalogBootstrapResult {
    sourceCount: number;
    enabledLegacyLeagueNames: string[];
}

interface TerritoryLogger {
    info?: (message: string) => void;
}

interface TerritorySourceEntry {
    manifest: TerritoryManifest;
    source: TerritorySourceConfig;
    platformId: string;
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Territory source catalog ${field} must be a non-empty string`);
    }
}

function assertOptionalBoolean(value: unknown, field: string): void {
    if (value !== undefined && typeof value !== 'boolean') {
        throw new Error(`Territory source catalog ${field} must be a boolean`);
    }
}

function assertNonNegativeInteger(value: unknown, field: string): void {
    if (!Number.isInteger(value) || Number(value) < 0) {
        throw new Error(`Territory source catalog ${field} must be a non-negative integer`);
    }
}

function assertPositiveInteger(value: unknown, field: string): void {
    if (!Number.isInteger(value) || Number(value) <= 0) {
        throw new Error(`Territory source catalog ${field} must be a positive integer`);
    }
}

function assertHttpUrl(value: unknown, field: string): asserts value is string {
    assertNonEmpty(value, field);
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Territory source catalog ${field} must be an absolute URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Territory source catalog ${field} must use http or https`);
    }
}

function validateHistory(history: unknown, prefix: string): void {
    if (history === undefined) return;
    if (!history || typeof history !== 'object' || Array.isArray(history)) {
        throw new Error(`Territory source catalog ${prefix} must be an object`);
    }
    const typed = history as Partial<HistoryConfig>;
    assertOptionalBoolean(typed.enabled, `${prefix}.enabled`);
    if (typed.maxSeasons !== undefined) {
        assertNonNegativeInteger(typed.maxSeasons, `${prefix}.maxSeasons`);
    }
    assertOptionalBoolean(typed.includeCups, `${prefix}.includeCups`);
}

function validateLeagueIngestion(
    source: TerritorySourceConfig,
    ingestion: TerritoryLeagueIngestionConfig,
    prefix: string,
): void {
    assertNonEmpty(ingestion.externalId, `${prefix}.externalId`);
    assertNonEmpty(ingestion.seasonName, `${prefix}.seasonName`);
    assertNonEmpty(ingestion.seasonExtId, `${prefix}.seasonExtId`);
    validateHistory(ingestion.history, `${prefix}.history`);

    if (ingestion.regions !== undefined) {
        if (!Array.isArray(ingestion.regions)) {
            throw new Error(`Territory source catalog ${prefix}.regions must be an array`);
        }
        for (const [index, region] of ingestion.regions.entries()) {
            assertNonEmpty(region, `${prefix}.regions[${index}]`);
        }
    }

    if (!Array.isArray(ingestion.divisions)) {
        throw new Error(`Territory source catalog ${prefix}.divisions must be an array`);
    }
    if (source.enabled === true && ingestion.divisions.length === 0) {
        throw new Error(
            `Territory source catalog ${prefix}.divisions must contain at least one division when enabled`,
        );
    }

    if (source.adapterKey === 'tt365') {
        if (
            source.platformName !== TT365_PLATFORM_NAME
            || source.platformBaseUrl !== TT365_PLATFORM_BASE_URL
        ) {
            throw new Error(
                `Territory source catalog ${prefix} has inconsistent TableTennis365 platform metadata`,
            );
        }
        const divisionKeys = new Set<string>();
        for (const [index, division] of ingestion.divisions.entries()) {
            const divisionPrefix = `${prefix}.divisions[${index}]`;
            if (!division || typeof division !== 'object' || Array.isArray(division)) {
                throw new Error(`Territory source catalog ${divisionPrefix} must be an object`);
            }
            const typed = division as Partial<TT365Division>;
            assertNonEmpty(typed.name, `${divisionPrefix}.name`);
            assertNonEmpty(typed.season, `${divisionPrefix}.season`);
            assertNonEmpty(typed.slug, `${divisionPrefix}.slug`);
            const key = typed.slug.toLowerCase();
            if (divisionKeys.has(key)) {
                throw new Error(`Territory source catalog ${divisionPrefix}.slug is duplicated`);
            }
            divisionKeys.add(key);
        }
        return;
    }

    if (source.adapterKey === 'ttleagues') {
        if (
            source.platformName !== TTLEAGUES_PLATFORM_NAME
            || source.platformBaseUrl !== TTLEAGUES_PLATFORM_BASE_URL
        ) {
            throw new Error(
                `Territory source catalog ${prefix} has inconsistent TT Leagues platform metadata`,
            );
        }
        const divisionKeys = new Set<number>();
        for (const [index, division] of ingestion.divisions.entries()) {
            const divisionPrefix = `${prefix}.divisions[${index}]`;
            if (!division || typeof division !== 'object' || Array.isArray(division)) {
                throw new Error(`Territory source catalog ${divisionPrefix} must be an object`);
            }
            const typed = division as Partial<TTLeaguesDivision>;
            assertNonEmpty(typed.name, `${divisionPrefix}.name`);
            assertPositiveInteger(typed.divisionId, `${divisionPrefix}.divisionId`);
            const key = typed.divisionId as number;
            if (divisionKeys.has(key)) {
                throw new Error(`Territory source catalog ${divisionPrefix}.divisionId is duplicated`);
            }
            divisionKeys.add(key);
        }
        return;
    }

    throw new Error(
        `Territory source catalog ${prefix} uses league-config with unsupported adapter ${source.adapterKey}`,
    );
}

export function parseTerritoryManifest(raw: string, filename = '<memory>'): TerritoryManifest {
    const parsed = JSON.parse(raw) as Partial<TerritoryManifest> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Territory source catalog ${filename} must contain an object`);
    }

    assertNonEmpty(parsed.territory, `${filename}.territory`);
    if (!Array.isArray(parsed.sources)) {
        throw new Error(`Territory source catalog ${filename}.sources must be an array`);
    }

    const sourceKeys = new Set<string>();
    const concreteLeagueIds = new Set<string>();
    for (const [sourceIndex, source] of parsed.sources.entries()) {
        const prefix = `${filename}.sources[${sourceIndex}]`;
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            throw new Error(`Territory source catalog ${prefix} must be an object`);
        }

        assertNonEmpty(source.key, `${prefix}.key`);
        if (sourceKeys.has(source.key)) {
            throw new Error(`Territory source catalog ${prefix}.key is duplicated: ${source.key}`);
        }
        sourceKeys.add(source.key);

        assertNonEmpty(source.name, `${prefix}.name`);
        assertNonEmpty(source.platformName, `${prefix}.platformName`);
        assertHttpUrl(source.platformBaseUrl, `${prefix}.platformBaseUrl`);
        assertHttpUrl(source.baseUrl, `${prefix}.baseUrl`);
        assertNonEmpty(source.adapterKey, `${prefix}.adapterKey`);
        if (!SOURCE_STATUSES.has(source.status ?? '')) {
            throw new Error(`Territory source catalog ${prefix}.status is invalid`);
        }
        assertOptionalBoolean(source.enabled, `${prefix}.enabled`);

        const ingestion = source.ingestion;
        if (ingestion !== undefined) {
            if (!ingestion || typeof ingestion !== 'object' || Array.isArray(ingestion)) {
                throw new Error(`Territory source catalog ${prefix}.ingestion must be an object`);
            }
            if (!INGESTION_MODES.has(ingestion.mode ?? '')) {
                throw new Error(`Territory source catalog ${prefix}.ingestion.mode is invalid`);
            }
            if (ingestion.mode === 'legacy-config') {
                assertNonEmpty(
                    ingestion.legacyLeagueName,
                    `${prefix}.ingestion.legacyLeagueName`,
                );
            } else if (ingestion.mode === 'league-config') {
                validateLeagueIngestion(source, ingestion, `${prefix}.ingestion`);
                if (concreteLeagueIds.has(ingestion.externalId)) {
                    throw new Error(
                        `Territory source catalog ${prefix}.ingestion.externalId is duplicated: `
                        + ingestion.externalId,
                    );
                }
                concreteLeagueIds.add(ingestion.externalId);
            }
        }

        if (
            source.enabled === true
            && ingestion?.mode !== 'legacy-config'
            && ingestion?.mode !== 'league-config'
        ) {
            throw new Error(
                `Territory source catalog ${prefix} cannot be enabled without a schedulable ingestion mode`,
            );
        }

        if (source.config !== undefined && (
            !source.config || typeof source.config !== 'object' || Array.isArray(source.config)
        )) {
            throw new Error(`Territory source catalog ${prefix}.config must be an object`);
        }

        if (source.resources !== undefined && !Array.isArray(source.resources)) {
            throw new Error(`Territory source catalog ${prefix}.resources must be an array`);
        }

        const resourceKeys = new Set<string>();
        for (const [resourceIndex, resource] of (source.resources ?? []).entries()) {
            const resourcePrefix = `${prefix}.resources[${resourceIndex}]`;
            if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
                throw new Error(`Territory source catalog ${resourcePrefix} must be an object`);
            }
            if (!RESOURCE_TYPES.has(resource.resourceType)) {
                throw new Error(
                    `Territory source catalog ${resourcePrefix}.resourceType is invalid: ${resource.resourceType}`,
                );
            }
            assertNonEmpty(resource.externalId, `${resourcePrefix}.externalId`);
            assertOptionalBoolean(resource.enabled, `${resourcePrefix}.enabled`);
            if (resource.publicUrl != null) {
                assertHttpUrl(resource.publicUrl, `${resourcePrefix}.publicUrl`);
            }

            const resourceKey = `${resource.resourceType}:${resource.externalId}`;
            if (resourceKeys.has(resourceKey)) {
                throw new Error(
                    `Territory source catalog ${resourcePrefix} duplicates resource ${resourceKey}`,
                );
            }
            resourceKeys.add(resourceKey);
        }

        if (ingestion?.mode === 'league-config') {
            const hasLeagueResource = (source.resources ?? []).some(
                (resource) => resource.resourceType === 'league'
                    && resource.externalId === ingestion.externalId,
            );
            if (!hasLeagueResource) {
                throw new Error(
                    `Territory source catalog ${prefix} league-config requires a matching league resource`,
                );
            }
        }
    }

    return parsed as TerritoryManifest;
}

export function readTerritoryManifests(): TerritoryManifest[] {
    let filenames: string[];
    try {
        filenames = readdirSync(TERRITORY_CONFIG_DIR)
            .filter((filename) => filename.endsWith('.json'))
            .sort();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/no such file/i.test(message)) return [];
        throw error;
    }

    const manifests = filenames.map((filename) => parseTerritoryManifest(
        readFileSync(resolve(TERRITORY_CONFIG_DIR, filename), 'utf8'),
        filename,
    ));

    const platforms = new Map<string, string>();
    const sourceIdentities = new Set<string>();
    const leagueExternalIds = new Set<string>();
    for (const manifest of manifests) {
        for (const source of manifest.sources) {
            const existingBaseUrl = platforms.get(source.platformName);
            if (existingBaseUrl && existingBaseUrl !== source.platformBaseUrl) {
                throw new Error(
                    `Territory source catalog platform ${source.platformName} has conflicting base URLs: `
                    + `${existingBaseUrl} vs ${source.platformBaseUrl}`,
                );
            }
            platforms.set(source.platformName, source.platformBaseUrl);

            const sourceIdentity = `${source.platformName}:${source.key}`;
            if (sourceIdentities.has(sourceIdentity)) {
                throw new Error(
                    `Territory source catalog source identity is duplicated across manifests: ${sourceIdentity}`,
                );
            }
            sourceIdentities.add(sourceIdentity);

            if (source.ingestion?.mode === 'league-config') {
                const externalId = source.ingestion.externalId;
                if (leagueExternalIds.has(externalId)) {
                    throw new Error(
                        `Territory source catalog league externalId is duplicated across manifests: ${externalId}`,
                    );
                }
                leagueExternalIds.add(externalId);
            }
        }
    }

    return manifests;
}

export function territoryManifestToLeagueConfigs(manifest: TerritoryManifest): LeagueConfig[] {
    const leagueConfigs: LeagueConfig[] = [];
    for (const source of manifest.sources) {
        if (source.ingestion?.mode !== 'league-config' || source.enabled !== true) continue;
        const ingestion = source.ingestion;
        const platform = source.adapterKey === 'tt365' ? 'tt365' : 'ttleagues';
        const league: LeagueConfig = {
            platform,
            leagueName: source.name,
            externalId: ingestion.externalId,
            seasonName: ingestion.seasonName,
            seasonExtId: ingestion.seasonExtId,
            baseUrl: source.baseUrl,
            divisions: ingestion.divisions.map((division) => ({ ...division })),
        };
        if (ingestion.history !== undefined) league.history = { ...ingestion.history };
        if (ingestion.regions !== undefined) league.regions = [...ingestion.regions];
        leagueConfigs.push(league);
    }
    return leagueConfigs;
}

export function readTerritoryLeagueConfigs(): LeagueConfig[] {
    return readTerritoryManifests().flatMap(territoryManifestToLeagueConfigs);
}

export function readTerritoryOwnedLeagueExternalIds(): string[] {
    const externalIds = new Set<string>();
    for (const manifest of readTerritoryManifests()) {
        for (const source of manifest.sources) {
            if (source.ingestion?.mode === 'league-config') {
                externalIds.add(source.ingestion.externalId);
            }
        }
    }
    return Array.from(externalIds).sort();
}

function sourceIdentity(platformId: string, key: string): string {
    return `${platformId}|${key}`;
}

function resourceIdentity(resourceType: string, externalId: string): string {
    return `${resourceType}|${externalId}`;
}

function isTerritoryManagedConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    return (config as Record<string, unknown>).managedBy === TERRITORY_MANAGED_BY;
}

async function mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= values.length) return;
            results[index] = await mapper(values[index] as T, index);
        }
    }

    const workerCount = Math.min(concurrency, values.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

async function resolvePlatformIds(
    db: Kysely<Database>,
    manifests: TerritoryManifest[],
): Promise<Map<string, string>> {
    const requestedPlatforms = new Map<string, string>();
    for (const manifest of manifests) {
        for (const source of manifest.sources) {
            requestedPlatforms.set(source.platformName, source.platformBaseUrl);
        }
    }
    if (requestedPlatforms.size === 0) return new Map();

    const existing = await db
        .selectFrom('platforms')
        .select(['id', 'name', 'base_url'])
        .where('name', 'in', Array.from(requestedPlatforms.keys()))
        .execute();
    const platformIds = new Map<string, string>();
    for (const platform of existing) {
        const requestedBaseUrl = requestedPlatforms.get(platform.name);
        if (requestedBaseUrl && requestedBaseUrl !== platform.base_url) {
            throw new Error(
                `Territory source catalog platform ${platform.name} has conflicting base URLs: `
                + `${platform.base_url} vs ${requestedBaseUrl}`,
            );
        }
        platformIds.set(platform.name, platform.id);
    }

    for (const [name, baseUrl] of requestedPlatforms) {
        if (platformIds.has(name)) continue;
        const row = await db
            .insertInto('platforms')
            .values({ name, base_url: baseUrl })
            .returning('id')
            .executeTakeFirstOrThrow();
        platformIds.set(name, row.id);
    }

    return platformIds;
}

async function readExistingLeagueIds(
    db: Kysely<Database>,
    platformIds: Map<string, string>,
): Promise<Map<string, string>> {
    const ids = Array.from(new Set(platformIds.values()));
    if (ids.length === 0) return new Map();
    const leagues = await db
        .selectFrom('leagues')
        .select(['id', 'platform_id', 'external_id'])
        .where('platform_id', 'in', ids)
        .execute();
    return new Map(
        leagues.map((league) => [
            `${league.platform_id}|${league.external_id}`,
            league.id,
        ] as const),
    );
}

async function reconcileTerritoryRegistry(
    db: Kysely<Database>,
    currentSourceIdentities: Set<string>,
    currentResourceIdentities: Map<string, Set<string>>,
): Promise<{ disabledSources: number; disabledResources: number }> {
    const sourceRows = await db
        .selectFrom('source_instances')
        .select(['id', 'platform_id', 'key', 'config'])
        .execute();
    const managedSources = sourceRows.filter((row) => isTerritoryManagedConfig(row.config));
    if (managedSources.length === 0) return { disabledSources: 0, disabledResources: 0 };

    const staleSourceIds = managedSources
        .filter((row) => !currentSourceIdentities.has(sourceIdentity(row.platform_id, row.key)))
        .map((row) => row.id);
    const staleSourceIdSet = new Set(staleSourceIds);
    const managedSourceIds = managedSources.map((row) => row.id);
    const sourceIdentityById = new Map(
        managedSources.map((row) => [row.id, sourceIdentity(row.platform_id, row.key)] as const),
    );

    const resourceRows = await db
        .selectFrom('source_resources')
        .select(['id', 'source_instance_id', 'resource_type', 'external_id'])
        .where('source_instance_id', 'in', managedSourceIds)
        .execute();
    const staleResourceIds = resourceRows
        .filter((resource) => {
            if (staleSourceIdSet.has(resource.source_instance_id)) return true;
            const identity = sourceIdentityById.get(resource.source_instance_id);
            if (!identity) return false;
            const configuredResources = currentResourceIdentities.get(identity) ?? new Set<string>();
            return !configuredResources.has(
                resourceIdentity(resource.resource_type, resource.external_id),
            );
        })
        .map((resource) => resource.id);

    const now = new Date();
    if (staleResourceIds.length > 0) {
        await db
            .updateTable('source_resources')
            .set({ enabled: false, updated_at: now })
            .where('id', 'in', staleResourceIds)
            .execute();
    }
    if (staleSourceIds.length > 0) {
        await db
            .updateTable('source_instances')
            .set({ enabled: false, updated_at: now })
            .where('id', 'in', staleSourceIds)
            .execute();
    }

    return {
        disabledSources: staleSourceIds.length,
        disabledResources: staleResourceIds.length,
    };
}

/**
 * Registers official territory data sources, including sources that are known but
 * intentionally not schedulable yet. Concrete `league-config` sources carry their
 * target configuration; `legacy-config` remains a temporary compatibility bridge.
 *
 * Territory-owned rows are reconciled rather than deleted: removing a source or
 * resource from a manifest disables the existing registry row so provenance and
 * historical health remain inspectable without claiming the source is operational.
 */
export async function bootstrapTerritorySourceCatalog(
    db: Kysely<Database>,
    options: { logger?: TerritoryLogger } = {},
): Promise<TerritoryCatalogBootstrapResult> {
    const startedAt = Date.now();
    const manifests = readTerritoryManifests();
    const platformIds = await resolvePlatformIds(db, manifests);
    const existingLeagueIds = await readExistingLeagueIds(db, platformIds);
    const enabledLegacyLeagueNames = new Set<string>();
    const currentSourceIdentities = new Set<string>();
    const currentResourceIdentities = new Map<string, Set<string>>();
    const entries: TerritorySourceEntry[] = [];

    for (const manifest of manifests) {
        for (const source of manifest.sources) {
            const platformId = platformIds.get(source.platformName);
            if (!platformId) {
                throw new Error(`Territory source catalog platform is missing: ${source.platformName}`);
            }
            const identity = sourceIdentity(platformId, source.key);
            currentSourceIdentities.add(identity);
            currentResourceIdentities.set(
                identity,
                new Set((source.resources ?? []).map(
                    (resource) => resourceIdentity(resource.resourceType, resource.externalId),
                )),
            );
            if (source.enabled === true && source.ingestion?.mode === 'legacy-config') {
                enabledLegacyLeagueNames.add(source.ingestion.legacyLeagueName);
            }
            entries.push({ manifest, source, platformId });
        }
    }

    await mapWithConcurrency(entries, BOOTSTRAP_CONCURRENCY, async ({ manifest, source, platformId }) => {
        const enabled = source.enabled ?? false;
        const ingestionMode = source.ingestion?.mode ?? 'catalog-only';
        const leagueExternalId = source.ingestion?.mode === 'league-config'
            ? source.ingestion.externalId
            : null;
        const sourceInstance = await upsertSourceInstance(db, {
            platformId,
            key: source.key,
            name: source.name,
            baseUrl: source.baseUrl,
            adapterKey: source.adapterKey,
            enabled,
            config: {
                ...(source.config ?? {}),
                managedBy: TERRITORY_MANAGED_BY,
                territory: manifest.territory,
                status: source.status,
                ingestionMode,
                leagueExternalId,
                notes: source.notes ?? null,
            },
        });

        const existingLeagueId = leagueExternalId
            ? existingLeagueIds.get(`${platformId}|${leagueExternalId}`) ?? null
            : null;
        await Promise.all((source.resources ?? []).map(async (resource) => {
            const isConcreteLeagueResource = leagueExternalId !== null
                && resource.resourceType === 'league'
                && resource.externalId === leagueExternalId;
            await upsertSourceResource(db, {
                sourceInstanceId: sourceInstance.id,
                resourceType: resource.resourceType,
                externalId: resource.externalId,
                adapterVersion: `${source.adapterKey}-v1`,
                name: resource.name ?? null,
                publicUrl: resource.publicUrl ?? source.baseUrl,
                refreshPolicy: resource.refreshPolicy ?? {},
                enabled: resource.enabled ?? enabled,
                leagueId: isConcreteLeagueResource ? existingLeagueId : null,
            });
        }));
    });

    const reconciled = await reconcileTerritoryRegistry(
        db,
        currentSourceIdentities,
        currentResourceIdentities,
    );
    const durationMs = Date.now() - startedAt;
    options.logger?.info?.(
        `bootstrapTerritorySourceCatalog: registered ${entries.length} sources across ${manifests.length} territories in ${durationMs}ms`
        + `; disabled ${reconciled.disabledSources} retired sources and ${reconciled.disabledResources} retired resources`,
    );
    return {
        sourceCount: entries.length,
        enabledLegacyLeagueNames: Array.from(enabledLegacyLeagueNames).sort(),
    };
}

/**
 * Links concrete territory league resources to the stable league rows produced by
 * bootstrapLeagueConfigs. A single set-based update replaces per-source platform,
 * league and source-instance lookups.
 */
export async function linkTerritoryLeagueResources(db: Kysely<Database>): Promise<number> {
    const result = await sql<{ id: string }>`
        UPDATE source_resources AS sr
        SET league_id = league.id,
            updated_at = now()
        FROM source_instances AS source,
             leagues AS league
        WHERE sr.source_instance_id = source.id
          AND league.platform_id = source.platform_id
          AND league.external_id = sr.external_id
          AND sr.resource_type = 'league'
          AND sr.enabled = true
          AND source.enabled = true
          AND source.config->>'managedBy' = ${TERRITORY_MANAGED_BY}
          AND source.config->>'ingestionMode' = 'league-config'
          AND source.config->>'leagueExternalId' = sr.external_id
        RETURNING sr.id
    `.execute(db);
    return result.rows.length;
}

export const __internal = {
    parseTerritoryManifest,
    isTerritoryManagedConfig,
};
