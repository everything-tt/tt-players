import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { SOURCE_RESOURCE_TYPES, type SourceResourceType } from './sources/adapter.js';
import { upsertSourceInstance, upsertSourceResource } from './sources/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TERRITORY_CONFIG_DIR = resolve(__dirname, '../config/territories');
const RESOURCE_TYPES = new Set<string>(SOURCE_RESOURCE_TYPES);
const SOURCE_STATUSES = new Set<string>(['active', 'discovery', 'blocked', 'external']);
const INGESTION_MODES = new Set<string>(['catalog-only', 'legacy-config']);

export type TerritorySourceStatus = 'active' | 'discovery' | 'blocked' | 'external';
export type TerritoryIngestionMode = 'catalog-only' | 'legacy-config';

export interface TerritoryIngestionConfig {
    mode: TerritoryIngestionMode;
    legacyLeagueName?: string;
}

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
                assertNonEmpty(ingestion.legacyLeagueName, `${prefix}.ingestion.legacyLeagueName`);
            }
        }

        if (source.enabled === true && ingestion?.mode !== 'legacy-config') {
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

    return filenames.map((filename) => parseTerritoryManifest(
        readFileSync(resolve(TERRITORY_CONFIG_DIR, filename), 'utf8'),
        filename,
    ));
}

async function upsertPlatform(
    db: Kysely<Database>,
    name: string,
    baseUrl: string,
): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select(['id', 'base_url'])
        .where('name', '=', name)
        .executeTakeFirst();

    if (existing) {
        if (existing.base_url !== baseUrl) {
            throw new Error(
                `Territory source catalog platform ${name} has conflicting base URLs: `
                + `${existing.base_url} vs ${baseUrl}`,
            );
        }
        return existing.id;
    }

    const row = await db
        .insertInto('platforms')
        .values({ name, base_url: baseUrl })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

/**
 * Registers official territory data sources, including sources that are known but
 * intentionally not schedulable yet.
 *
 * A source is enabled only when the manifest explicitly opts it into a supported
 * ingestion mode. `legacy-config` is the compatibility bridge for TT365/TT Leagues
 * sources that still obtain their concrete scrape targets from bootstrap.ts. This
 * keeps registry health truthful while territory-driven target generation is
 * introduced incrementally.
 */
export async function bootstrapTerritorySourceCatalog(
    db: Kysely<Database>,
    options: { logger?: TerritoryLogger } = {},
): Promise<TerritoryCatalogBootstrapResult> {
    const manifests = readTerritoryManifests();
    let sourceCount = 0;
    const enabledLegacyLeagueNames = new Set<string>();

    for (const manifest of manifests) {
        for (const source of manifest.sources) {
            const platformId = await upsertPlatform(db, source.platformName, source.platformBaseUrl);
            const enabled = source.enabled ?? false;
            const ingestionMode = source.ingestion?.mode ?? 'catalog-only';

            if (enabled && ingestionMode === 'legacy-config') {
                enabledLegacyLeagueNames.add(source.ingestion!.legacyLeagueName!);
            }

            const sourceInstance = await upsertSourceInstance(db, {
                platformId,
                key: source.key,
                name: source.name,
                baseUrl: source.baseUrl,
                adapterKey: source.adapterKey,
                enabled,
                config: {
                    territory: manifest.territory,
                    status: source.status,
                    ingestionMode,
                    notes: source.notes ?? null,
                    ...(source.config ?? {}),
                },
            });

            for (const resource of source.resources ?? []) {
                await upsertSourceResource(db, {
                    sourceInstanceId: sourceInstance.id,
                    resourceType: resource.resourceType,
                    externalId: resource.externalId,
                    adapterVersion: `${source.adapterKey}-v1`,
                    name: resource.name ?? null,
                    publicUrl: resource.publicUrl ?? source.baseUrl,
                    refreshPolicy: resource.refreshPolicy ?? {},
                    enabled: resource.enabled ?? enabled,
                });
            }

            sourceCount += 1;
        }
    }

    options.logger?.info?.(
        `bootstrapTerritorySourceCatalog: registered ${sourceCount} sources across ${manifests.length} territories`,
    );
    return {
        sourceCount,
        enabledLegacyLeagueNames: Array.from(enabledLegacyLeagueNames).sort(),
    };
}

export const __internal = {
    parseTerritoryManifest,
};
