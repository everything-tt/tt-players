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

export type TerritorySourceStatus = 'active' | 'discovery' | 'blocked' | 'external';

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
    notes?: string;
    config?: Record<string, unknown>;
    resources?: TerritoryResourceConfig[];
}

export interface TerritoryManifest {
    territory: string;
    sources: TerritorySourceConfig[];
}

interface TerritoryLogger {
    info?: (message: string) => void;
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Territory source catalog ${field} must be a non-empty string`);
    }
}

export function parseTerritoryManifest(raw: string, filename = '<memory>'): TerritoryManifest {
    const parsed = JSON.parse(raw) as Partial<TerritoryManifest>;
    assertNonEmpty(parsed.territory, `${filename}.territory`);
    if (!Array.isArray(parsed.sources)) {
        throw new Error(`Territory source catalog ${filename}.sources must be an array`);
    }

    for (const [sourceIndex, source] of parsed.sources.entries()) {
        const prefix = `${filename}.sources[${sourceIndex}]`;
        assertNonEmpty(source?.key, `${prefix}.key`);
        assertNonEmpty(source?.name, `${prefix}.name`);
        assertNonEmpty(source?.platformName, `${prefix}.platformName`);
        assertNonEmpty(source?.platformBaseUrl, `${prefix}.platformBaseUrl`);
        assertNonEmpty(source?.baseUrl, `${prefix}.baseUrl`);
        assertNonEmpty(source?.adapterKey, `${prefix}.adapterKey`);
        if (!['active', 'discovery', 'blocked', 'external'].includes(source?.status ?? '')) {
            throw new Error(`Territory source catalog ${prefix}.status is invalid`);
        }

        for (const [resourceIndex, resource] of (source.resources ?? []).entries()) {
            const resourcePrefix = `${prefix}.resources[${resourceIndex}]`;
            if (!RESOURCE_TYPES.has(resource.resourceType)) {
                throw new Error(
                    `Territory source catalog ${resourcePrefix}.resourceType is invalid: ${resource.resourceType}`,
                );
            }
            assertNonEmpty(resource.externalId, `${resourcePrefix}.externalId`);
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
            await db
                .updateTable('platforms')
                .set({ base_url: baseUrl })
                .where('id', '=', existing.id)
                .execute();
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
 * Registers official territory data sources even when a parser is not yet enabled.
 *
 * This complements scrape-target bootstrap: supported TT365/TT Leagues sources can
 * continue to generate scrape targets through bootstrap.ts, while custom national
 * event systems and blocked/discovery sources still get explicit provenance and
 * implementation status in source_instances/source_resources.
 */
export async function bootstrapTerritorySourceCatalog(
    db: Kysely<Database>,
    options: { logger?: TerritoryLogger } = {},
): Promise<number> {
    const manifests = readTerritoryManifests();
    let sourceCount = 0;

    for (const manifest of manifests) {
        for (const source of manifest.sources) {
            const platformId = await upsertPlatform(db, source.platformName, source.platformBaseUrl);
            const enabled = source.enabled ?? source.status === 'active';
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
    return sourceCount;
}

export const __internal = {
    parseTerritoryManifest,
};
