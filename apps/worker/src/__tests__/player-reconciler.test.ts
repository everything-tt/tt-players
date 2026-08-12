import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m030 from '@tt-players/db/src/migrations/030_create_player_identity_decisions.js';

import type { Database } from '@tt-players/db';
import {
    confirmPlayerIdentity,
    reconcilePlayersByName,
    rejectPlayerIdentity,
    unmergePlayer,
} from '../player-reconciler.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_player_reconciler_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '006_add_canonical_player_id_to_external_players': m006,
            '030_create_player_identity_decisions': m030,
        };
    }
}

let db: Kysely<Database>;
let fixtureId: string;
let tt365PlatformId: string;
let ttLeaguesPlatformId: string;

async function createTestDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropTestDatabase(): Promise<void> {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}

async function createPlayerPair(name = 'Andrew Jessop') {
    const tt365Player = await db
        .insertInto('external_players')
        .values({
            platform_id: tt365PlatformId,
            external_id: `tt365-${Math.random()}`,
            name,
        })
        .returning(['id', 'canonical_player_id'])
        .executeTakeFirstOrThrow();
    const ttLeaguesPlayer = await db
        .insertInto('external_players')
        .values({
            platform_id: ttLeaguesPlatformId,
            external_id: `ttl-${Math.random()}`,
            name,
        })
        .returning(['id', 'canonical_player_id'])
        .executeTakeFirstOrThrow();

    await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixtureId,
            external_id: `rubber-${Math.random()}`,
            is_doubles: false,
            home_player_1_id: ttLeaguesPlayer.id,
            away_player_1_id: tt365Player.id,
            home_games_won: 3,
            away_games_won: 1,
            outcome_type: 'normal',
        })
        .execute();

    return { tt365Player, ttLeaguesPlayer };
}

async function createSamePlatformPair(
    name = 'Same Platform Player',
    rubberCount = 1,
) {
    const first = await db
        .insertInto('external_players')
        .values({
            platform_id: tt365PlatformId,
            external_id: `tt365-first-${Math.random()}`,
            name,
        })
        .returning(['id', 'canonical_player_id'])
        .executeTakeFirstOrThrow();
    const second = await db
        .insertInto('external_players')
        .values({
            platform_id: tt365PlatformId,
            external_id: `tt365-second-${Math.random()}`,
            name,
        })
        .returning(['id', 'canonical_player_id'])
        .executeTakeFirstOrThrow();

    await db
        .insertInto('rubbers')
        .values(Array.from({ length: rubberCount }, (_, index) => ({
            fixture_id: fixtureId,
            external_id: `same-platform-rubber-${index}-${Math.random()}`,
            is_doubles: false,
            home_player_1_id: first.id,
            away_player_1_id: second.id,
            home_games_won: 3,
            away_games_won: 1,
            outcome_type: 'normal' as const,
        })))
        .execute();

    return { first, second };
}

describe('evidence-based player identity reconciliation', () => {
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

        const tt365 = await db
            .insertInto('platforms')
            .values({
                name: 'TableTennis365',
                base_url: 'https://www.tabletennis365.com',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        tt365PlatformId = tt365.id;

        const ttLeagues = await db
            .insertInto('platforms')
            .values({
                name: 'TT Leagues',
                base_url: 'https://ttleagues-api.azurewebsites.net/api',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        ttLeaguesPlatformId = ttLeagues.id;

        const league = await db
            .insertInto('leagues')
            .values({
                platform_id: tt365PlatformId,
                external_id: 'league-1',
                name: 'League 1',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const season = await db
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: '2025-26',
                name: '2025-26',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const competition = await db
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'premier',
                name: 'Premier',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const teams = await db
            .insertInto('teams')
            .values([
                { competition_id: competition.id, external_id: 'home', name: 'Home' },
                { competition_id: competition.id, external_id: 'away', name: 'Away' },
            ])
            .returning('id')
            .execute();
        const fixture = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition.id,
                external_id: 'fixture-1',
                home_team_id: teams[0]!.id,
                away_team_id: teams[1]!.id,
                status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        fixtureId = fixture.id;
    }, 30_000);

    beforeEach(async () => {
        await db.deleteFrom('player_identity_decisions').execute();
        await db.deleteFrom('rubbers').execute();
        await db.deleteFrom('external_players').execute();
    });

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    it('creates a review suggestion without merging exact-name players', async () => {
        const pair = await createPlayerPair();
        const result = await reconcilePlayersByName(db);

        expect(result.linkedGroups).toBe(0);
        expect(result.suggestedGroups).toBe(1);
        expect(result.suggestedLinks).toBe(1);
        expect(result.remappedRubbers).toBe(0);

        const players = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id'])
            .where('name', '=', 'Andrew Jessop')
            .execute();
        const effectiveCanonicalIds = new Set(
            players.map((player) => player.canonical_player_id ?? player.id),
        );
        expect(effectiveCanonicalIds.size).toBe(2);

        const decision = await db
            .selectFrom('player_identity_decisions')
            .selectAll()
            .executeTakeFirstOrThrow();
        expect(decision.status).toBe('suggested');
        expect(decision.confidence).toBe(0.65);
        expect(decision.created_by).toBe('automatic');
        expect(decision.evidence).toMatchObject({ rule: 'exact-normalized-name' });

        const rubber = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id', 'away_player_1_id'])
            .executeTakeFirstOrThrow();
        expect(new Set([rubber.home_player_1_id, rubber.away_player_1_id])).toEqual(
            new Set([pair.tt365Player.id, pair.ttLeaguesPlayer.id]),
        );
    });

    it('deduplicates repeated rubbers to distinct player/league memberships', async () => {
        const pair = await createSamePlatformPair('Repeated Same Platform Player', 100);
        const logger = { info: vi.fn() };

        const result = await reconcilePlayersByName(db, logger);

        expect(result.linkedGroups).toBe(0);
        expect(result.suggestedGroups).toBe(1);
        expect(result.suggestedLinks).toBe(1);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('loaded 2 distinct player/league memberships'),
        );

        const decision = await db
            .selectFrom('player_identity_decisions')
            .selectAll()
            .executeTakeFirstOrThrow();
        expect(decision.status).toBe('suggested');
        expect(decision.confidence).toBe(0.8);
        expect(decision.evidence).toMatchObject({
            rule: 'same-platform-same-league',
            league_name: 'League 1',
        });

        const rubberPlayers = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id', 'away_player_1_id'])
            .limit(1)
            .executeTakeFirstOrThrow();
        expect(new Set([rubberPlayers.home_player_1_id, rubberPlayers.away_player_1_id])).toEqual(
            new Set([pair.first.id, pair.second.id]),
        );
    });

    it('applies only a confirmed decision and keeps rubber source IDs', async () => {
        const pair = await createPlayerPair();
        await reconcilePlayersByName(db);
        const suggestion = await db
            .selectFrom('player_identity_decisions')
            .select(['source_player_id', 'canonical_player_id'])
            .executeTakeFirstOrThrow();

        await confirmPlayerIdentity(
            db,
            suggestion.source_player_id,
            suggestion.canonical_player_id,
            { rule: 'manual-confirmation', reviewer: 'test' },
        );

        const source = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id'])
            .where('id', '=', suggestion.source_player_id)
            .executeTakeFirstOrThrow();
        expect(source.canonical_player_id).toBe(suggestion.canonical_player_id);

        const decision = await db
            .selectFrom('player_identity_decisions')
            .select(['status', 'confidence', 'created_by', 'decided_at'])
            .executeTakeFirstOrThrow();
        expect(decision.status).toBe('confirmed');
        expect(decision.confidence).toBe(1);
        expect(decision.created_by).toBe('manual');
        expect(decision.decided_at).not.toBeNull();

        const rubber = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id', 'away_player_1_id'])
            .executeTakeFirstOrThrow();
        expect(new Set([rubber.home_player_1_id, rubber.away_player_1_id])).toEqual(
            new Set([pair.tt365Player.id, pair.ttLeaguesPlayer.id]),
        );

        await unmergePlayer(db, suggestion.source_player_id);
        const unmerged = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id'])
            .where('id', '=', suggestion.source_player_id)
            .executeTakeFirstOrThrow();
        expect(unmerged.canonical_player_id).toBe(unmerged.id);

        const rejectedDecision = await db
            .selectFrom('player_identity_decisions')
            .select('status')
            .executeTakeFirstOrThrow();
        expect(rejectedDecision.status).toBe('rejected');
    });

    it('does not recreate a rejected exact-name suggestion', async () => {
        await createPlayerPair('Chris Taylor');
        await reconcilePlayersByName(db);
        const suggestion = await db
            .selectFrom('player_identity_decisions')
            .select(['source_player_id', 'canonical_player_id'])
            .executeTakeFirstOrThrow();

        await rejectPlayerIdentity(
            db,
            suggestion.source_player_id,
            suggestion.canonical_player_id,
            { rule: 'manual-rejection', reason: 'different people' },
        );

        const result = await reconcilePlayersByName(db);
        expect(result.suggestedLinks).toBe(0);
        expect(result.linkedGroups).toBe(0);

        const decisions = await db
            .selectFrom('player_identity_decisions')
            .select(['status', 'confidence'])
            .execute();
        expect(decisions).toEqual([{ status: 'rejected', confidence: 0 }]);
    });

    it('rejects attempts to confirm a player as themselves', async () => {
        const { tt365Player } = await createPlayerPair('Self Link');
        await expect(confirmPlayerIdentity(
            db,
            tt365Player.id,
            tt365Player.id,
        )).rejects.toThrow('must be different');
    });
});
