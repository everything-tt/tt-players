import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
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

async function findExistingLeagueId(
    db: Kysely<Database>,
    platformId: string,
    source: TerritorySourceConfig,
): Promise<string | null> {
    if (source.ingestion?.mode !== 'league-config') return null;
    const league = await db
        .selectFrom('leagues')
        .select('id')
        .where('platform_id', '=', platformId)
        .where('external_id', '=', source.ingestion.externalId)
        .executeTakeFirst();
    return league?.id ?? null;
}

/**
 * Registers official territory data sources, including sources that are known but
 * intentionally not schedulable yet. `league-config` sources carry concrete target
 * configuration; `legacy-config` remains a temporary compatibility bridge for
 * territories that have not yet migrated their target definitions.
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

  if (enabled && source.ingestion?.mode === 'legacy-config') {
      enabledLegacyLeagueNames.add(source.ingestion.legacyLeagueName);
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

  const existingLeagueId = await findExistingLeagueId(db, platformId, source);
  for (const resource of source.resources ?? []) {
      const isConcreteLeagueResource = source.ingestion?.mode === 'league-config'
          && resource.resourceType === 'league'
          && resource.externalId === source.ingestion.externalId;
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

/**
 * Links concrete territory league resources to the stable league rows produced by
 * bootstrapLeagueConfigs. This makes provenance navigable without changing league,
 * season, competition, or raw-scrape identities.
 */
export async function linkTerritoryLeagueResources(db: Kysely<Database>): Promise<number> {
    let linked = 0;
    for (const manifest of readTerritoryManifests()) {
        for (const source of manifest.sources) {
  if (source.ingestion?.mode !== 'league-config' || source.enabled !== true) continue;

  const platform = await db
      .selectFrom('platforms')
      .select('id')
      .where('name', '=', source.platformName)
      .executeTakeFirst();
  if (!platform) continue;

  const league = await db
      .selectFrom('leagues')
      .select('id')
      .where('platform_id', '=', platform.id)
      .where('external_id', '=', source.ingestion.externalId)
      .executeTakeFirst();
  if (!league) continue;

  const sourceInstance = await db
      .selectFrom('source_instances')
      .select('id')
      .where('platform_id', '=', platform.id)
      .where('key', '=', source.key)
      .executeTakeFirst();
  if (!sourceInstance) continue;

  await db
      .updateTable('source_resources')
      .set({
          league_id: league.id,
          updated_at: new Date(),
      })
      .where('source_instance_id', '=', sourceInstance.id)
      .where('resource_type', '=', 'league')
      .where('external_id', '=', source.ingestion.externalId)
      .execute();
  linked += 1;
        }
    }
    return linked;
}

export const __internal = {
    parseTerritoryManifest,
};
