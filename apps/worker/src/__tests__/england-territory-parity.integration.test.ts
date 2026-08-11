import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import { bootstrapLeagueConfigs, readLegacyLeagueConfigs } from '../bootstrap.js';
import { resolveConfiguredLeagueTargets } from '../all-scrape-targets.js';
import {
    bootstrapTerritorySourceCatalog,
    linkTerritoryLeagueResources,
    readTerritoryLeagueConfigs,
    readTerritoryOwnedLeagueExternalIds,
} from '../territory-source-catalog.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_england_territory_parity_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '004_create_raw_scrape_logs': m004,
            '009_create_regions': m009,
            '029_create_source_registry': m029,
        };
    }
}

let db: Kysely<Database>;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (db) await db.destroy();
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.end();
}

beforeAll(async () => {
    await createTestDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
});

afterAll(async () => {
    await dropTestDatabase();
});

describe('England territory migration parity', () => {
    it('reproduces every legacy England config and target without changing stable rows', async () => {
        const legacyEngland = readLegacyLeagueConfigs().filter(
            (league) => league.regions?.includes('England') === true,
        );
        const territoryEngland = readTerritoryLeagueConfigs().filter(
            (league) => league.regions?.includes('England') === true,
        );

        expect(legacyEngland.length).toBeGreaterThan(0);
        expect(territoryEngland).toEqual(legacyEngland);
        expect(readTerritoryOwnedLeagueExternalIds()).toEqual(
            [...legacyEngland.map((league) => league.externalId)].sort(),
        );

        await bootstrapTerritorySourceCatalog(db);
        const territoryKeys = territoryEngland.map((league) => league.externalId);
        const englandSources = await db
            .selectFrom('source_instances')
            .select(['id', 'key', 'enabled'])
            .where('key', 'in', territoryKeys)
            .execute();
        expect(englandSources).toHaveLength(territoryEngland.length);
        expect(englandSources.every((source) => source.enabled)).toBe(true);

        const legacyTargets = await bootstrapLeagueConfigs(db, legacyEngland);
        const continuityTarget = legacyTargets[0];
        expect(continuityTarget).toBeDefined();
        const rawLog = await db
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: continuityTarget!.platformId,
                endpoint_url: continuityTarget!.url,
                raw_payload: '{"parity":"before-territory"}',
                payload_hash: 'territory-parity-continuity',
                status: 'processed',
            })
            .returning(['id', 'platform_id', 'endpoint_url'])
            .executeTakeFirstOrThrow();
        const leagueIdsBefore = await db
            .selectFrom('leagues')
            .select(['external_id', 'id'])
            .where('external_id', 'in', territoryKeys)
            .orderBy('external_id', 'asc')
            .execute();

        const territoryTargets = await bootstrapLeagueConfigs(db, territoryEngland);
        expect(territoryTargets).toEqual(legacyTargets);

        const configuredTargets = await resolveConfiguredLeagueTargets(db, {
            leagueNames: legacyEngland.map((league) => league.leagueName),
        });
        expect(configuredTargets).toEqual(legacyTargets);

        const targetIdentities = territoryTargets.map((target) => [
            target.platformType,
            target.competitionId,
            target.divisionExtId,
            target.url,
            target.fixturesUrl ?? '',
        ].join('|'));
        expect(new Set(targetIdentities).size).toBe(targetIdentities.length);

        const leagueIdsAfter = await db
            .selectFrom('leagues')
            .select(['external_id', 'id'])
            .where('external_id', 'in', territoryKeys)
            .orderBy('external_id', 'asc')
            .execute();
        expect(leagueIdsAfter).toEqual(leagueIdsBefore);

        const rawLogAfter = await db
            .selectFrom('raw_scrape_logs')
            .select(['platform_id', 'endpoint_url'])
            .where('id', '=', rawLog.id)
            .executeTakeFirstOrThrow();
        expect(rawLogAfter).toEqual({
            platform_id: rawLog.platform_id,
            endpoint_url: rawLog.endpoint_url,
        });
        expect(configuredTargets.some(
            (target) => target.platformId === rawLog.platform_id
                && target.url === rawLog.endpoint_url,
        )).toBe(true);

        const linkedCount = await linkTerritoryLeagueResources(db);
        expect(linkedCount).toBe(territoryEngland.length);
        const linkedResources = await db
            .selectFrom('source_resources as sr')
            .innerJoin('source_instances as si', 'si.id', 'sr.source_instance_id')
            .select(['si.key', 'sr.external_id', 'sr.league_id'])
            .where('si.key', 'in', territoryKeys)
            .where('sr.resource_type', '=', 'league')
            .execute();
        expect(linkedResources).toHaveLength(territoryEngland.length);
        expect(linkedResources.every((resource) => resource.league_id !== null)).toBe(true);

        const sourceCountBefore = await db
            .selectFrom('source_instances')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        const resourceCountBefore = await db
            .selectFrom('source_resources')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        await bootstrapTerritorySourceCatalog(db);
        const sourceCountAfter = await db
            .selectFrom('source_instances')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        const resourceCountAfter = await db
            .selectFrom('source_resources')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        expect(Number(sourceCountAfter.count)).toBe(Number(sourceCountBefore.count));
        expect(Number(resourceCountAfter.count)).toBe(Number(resourceCountBefore.count));
    });
});
