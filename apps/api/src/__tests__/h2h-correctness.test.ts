import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '../../../../packages/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '../../../../packages/db/src/migrations/008_create_cache_entries.js';
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '../../../../packages/db/src/migrations/028_create_calculated_ratings.js';
import * as m031 from '../../../../packages/db/src/migrations/031_create_weekly_rating_history.js';
import * as m038 from '../../../../packages/db/src/migrations/038_flatten_player_identity_chains.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_h2h_correctness_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;
let request: ReturnType<typeof supertest>;
let directRootId: string;
let directOpponentId: string;
let commonPlayer1Id: string;
let commonPlayer2Id: string;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    await m001.up(db);
    await m002.up(db);
    await m003.up(db);
    await m005.up(db);
    await m006.up(db);
    await m007.up(db);
    await m008.up(db);
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m031.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'H2H Test Platform', base_url: 'https://h2h.example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'h2h-league', name: 'H2H League' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await db
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: 'h2h-season', name: '2025/26', is_active: true })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({ season_id: season.id, external_id: 'h2h-division', name: 'Division 1', type: 'league' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const fixture = await db
        .insertInto('fixtures')
        .values({
            competition_id: competition.id,
            external_id: 'h2h-fixture',
            date_played: '2026-01-10',
            status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

    const chainPlayers = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'direct-root', name: 'Direct Root' },
            { platform_id: platform.id, external_id: 'direct-middle', name: 'Direct Middle' },
            { platform_id: platform.id, external_id: 'direct-leaf', name: 'Direct Leaf' },
            { platform_id: platform.id, external_id: 'direct-opponent', name: 'Direct Opponent' },
        ])
        .returning(['id', 'external_id'])
        .execute();
    const byExternalId = new Map(chainPlayers.map((player) => [player.external_id, player.id]));
    directRootId = byExternalId.get('direct-root')!;
    const directMiddleId = byExternalId.get('direct-middle')!;
    const directLeafId = byExternalId.get('direct-leaf')!;
    directOpponentId = byExternalId.get('direct-opponent')!;

    await db
        .updateTable('external_players')
        .set({ canonical_player_id: directRootId })
        .where('id', '=', directRootId)
        .execute();
    await db
        .updateTable('external_players')
        .set({ canonical_player_id: directRootId })
        .where('id', '=', directMiddleId)
        .execute();
    await db
        .updateTable('external_players')
        .set({ canonical_player_id: directMiddleId })
        .where('id', '=', directLeafId)
        .execute();
    await db
        .updateTable('external_players')
        .set({ canonical_player_id: directOpponentId })
        .where('id', '=', directOpponentId)
        .execute();

    await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture.id,
            external_id: 'nested-alias-direct-match',
            home_player_1_id: directLeafId,
            away_player_1_id: directOpponentId,
            home_games_won: 3,
            away_games_won: 1,
            outcome_type: 'normal',
        })
        .execute();

    // The migration must repair existing chains before any H2H endpoint reads them.
    await m038.up(db);

    const commonPlayers = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'common-player-1', name: 'Common Player One' },
            { platform_id: platform.id, external_id: 'common-player-2', name: 'Common Player Two' },
            ...Array.from({ length: 12 }, (_, index) => ({
                platform_id: platform.id,
                external_id: `common-opponent-${index + 1}`,
                name: index < 5 ? `A Opponent ${index + 1}` : `Z Opponent ${index + 1}`,
            })),
        ])
        .returning(['id', 'external_id'])
        .execute();
    const commonByExternalId = new Map(commonPlayers.map((player) => [player.external_id, player.id]));
    commonPlayer1Id = commonByExternalId.get('common-player-1')!;
    commonPlayer2Id = commonByExternalId.get('common-player-2')!;

    const commonRubbers = Array.from({ length: 12 }, (_, index) => {
        const opponentId = commonByExternalId.get(`common-opponent-${index + 1}`)!;
        const player1Wins = index < 5;
        return [
            {
                fixture_id: fixture.id,
                external_id: `common-p1-${index + 1}`,
                home_player_1_id: commonPlayer1Id,
                away_player_1_id: opponentId,
                home_games_won: player1Wins ? 3 : 0,
                away_games_won: player1Wins ? 0 : 3,
                outcome_type: 'normal' as const,
            },
            {
                fixture_id: fixture.id,
                external_id: `common-p2-${index + 1}`,
                home_player_1_id: commonPlayer2Id,
                away_player_1_id: opponentId,
                home_games_won: player1Wins ? 0 : 3,
                away_games_won: player1Wins ? 3 : 0,
                outcome_type: 'normal' as const,
            },
        ];
    }).flat();
    await db.insertInto('rubbers').values(commonRubbers).execute();

    app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

beforeEach(async () => {
    await db.deleteFrom('cache_entries').execute();
});

afterAll(async () => {
    await app?.close();
    await db?.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}, 15_000);

describe('H2H API correctness', () => {
    it('finds direct encounters stored against a nested player alias', async () => {
        const repairedAlias = await db
            .selectFrom('external_players')
            .select('canonical_player_id')
            .where('external_id', '=', 'direct-leaf')
            .executeTakeFirstOrThrow();
        expect(repairedAlias.canonical_player_id).toBe(directRootId);

        const response = await request
            .get(`/api/players/${directRootId}/h2h/${directOpponentId}`)
            .expect(200);

        expect(response.body.player1_wins).toBe(1);
        expect(response.body.player2_wins).toBe(0);
        expect(response.body.encounters).toHaveLength(1);
    });

    it('computes common-opponent totals and aggregate edge before applying the detail limit', async () => {
        const response = await request
            .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/analysis?common_limit=5`)
            .expect(200);

        expect(response.body.common_opponents.data).toHaveLength(5);
        expect(response.body.common_opponents.total).toBe(12);
        expect(response.body.common_opponents.player1_advantage).toBe(5);
        expect(response.body.common_opponents.player2_advantage).toBe(7);
        expect(response.body.common_opponents.even).toBe(0);
        expect(response.body.common_opponents.aggregate_edge).toBe(-17);
    });

    it('shares one server cache entry between reversed player order', async () => {
        const forward = await request
            .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/analysis?common_limit=5`)
            .expect(200);

        const afterForward = await db
            .selectFrom('cache_entries')
            .select(['cache_key', 'source_version', 'updated_at'])
            .where('type', '=', 'h2h-analysis')
            .execute();
        expect(afterForward).toHaveLength(1);

        const reversed = await request
            .get(`/api/players/${commonPlayer2Id}/h2h/${commonPlayer1Id}/analysis?common_limit=5`)
            .expect(200);

        expect(reversed.body.players.player1.id).toBe(commonPlayer2Id);
        expect(reversed.body.players.player2.id).toBe(commonPlayer1Id);
        expect(reversed.body.common_opponents.aggregate_edge).toBe(17);
        expect(reversed.body.common_opponents.player1_advantage).toBe(7);
        expect(reversed.body.common_opponents.player2_advantage).toBe(5);
        expect(reversed.body.common_opponents.data[0].edge).toBe(-forward.body.common_opponents.data[0].edge);
        expect(reversed.body.common_opponents.data[0].player1).toEqual(forward.body.common_opponents.data[0].player2);

        const afterReversed = await db
            .selectFrom('cache_entries')
            .select(['cache_key', 'source_version', 'updated_at'])
            .where('type', '=', 'h2h-analysis')
            .execute();
        expect(afterReversed).toHaveLength(1);
        expect(afterReversed[0]?.cache_key).toBe(afterForward[0]?.cache_key);
        expect(afterReversed[0]?.source_version).toBe(afterForward[0]?.source_version);
        expect(afterReversed[0]?.updated_at).toEqual(afterForward[0]?.updated_at);
    });

    it('invalidates the server cache when a relevant rubber changes', async () => {
        await request
            .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/analysis?common_limit=5`)
            .expect(200);

        const before = await db
            .selectFrom('cache_entries')
            .select(['source_version', 'updated_at'])
            .where('type', '=', 'h2h-analysis')
            .executeTakeFirstOrThrow();

        await db
            .updateTable('rubbers')
            .set({ updated_at: new Date('2035-01-01T00:00:00.000Z') })
            .where('external_id', '=', 'common-p1-1')
            .execute();

        await request
            .get(`/api/players/${commonPlayer1Id}/h2h/${commonPlayer2Id}/analysis?common_limit=5`)
            .expect(200);

        const after = await db
            .selectFrom('cache_entries')
            .select(['source_version', 'updated_at'])
            .where('type', '=', 'h2h-analysis')
            .executeTakeFirstOrThrow();

        expect(after.source_version).not.toBe(before.source_version);
        expect(after.updated_at).not.toEqual(before.updated_at);
    });
});
