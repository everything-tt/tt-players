import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '@tt-players/db/src/migrations/028_create_calculated_ratings.js';
import * as m035 from '@tt-players/db/src/migrations/035_create_api_read_models.js';
import * as m040 from '@tt-players/db/src/migrations/040_create_rating_audit_snapshots.js';
import * as m042 from '@tt-players/db/src/migrations/042_create_rating_audit_foundation.js';
import * as m043 from '@tt-players/db/src/migrations/043_create_rating_player_coverage.js';
import * as m045 from '@tt-players/db/src/migrations/045_create_current_rating_rankings.js';
import * as m049 from '@tt-players/db/src/migrations/049_remove_rating_match_threshold.js';
import { refreshCurrentRankings } from '../ratings/current-rankings.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_current_rankings_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<any>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    db = new Kysely<any>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    await m001.up(db);
    await m002.up(db);
    await m003.up(db);
    await m005.up(db);
    await m006.up(db);
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m035.up(db);
    await m040.up(db);
    await m042.up(db);
    await m043.up(db);
    await m045.up(db);
    await m049.up(db);
}, 30_000);

afterAll(async () => {
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
}, 15_000);

describe('current rating rankings', () => {
    it('separates active rank from historical rating and uses RD instead of a match-count gate', async () => {
        const platform = await db.insertInto('platforms').values({
            name: 'Ranking Platform',
            base_url: 'https://ranking.example',
        }).returning('id').executeTakeFirstOrThrow();
        const players = await db.insertInto('external_players').values([
            { platform_id: platform.id, external_id: 'active', canonical_player_id: null, name: 'Active Player', updated_at: new Date(), deleted_at: null },
            { platform_id: platform.id, external_id: 'few-matches', canonical_player_id: null, name: 'Few Matches Player', updated_at: new Date(), deleted_at: null },
            { platform_id: platform.id, external_id: 'inactive', canonical_player_id: null, name: 'Inactive Player', updated_at: new Date(), deleted_at: null },
            { platform_id: platform.id, external_id: 'sparse', canonical_player_id: null, name: 'Sparse Player', updated_at: new Date(), deleted_at: null },
            { platform_id: platform.id, external_id: 'uncertain', canonical_player_id: null, name: 'Uncertain Player', updated_at: new Date(), deleted_at: null },
        ]).returning(['id', 'external_id']).execute();
        const byExternalId = new Map(players.map((player) => [player.external_id, player.id]));
        const model = await db.selectFrom('rating_models')
            .select('id')
            .where('key', '=', 'global-singles-glicko2-v1')
            .executeTakeFirstOrThrow();
        const calculatedAt = new Date('2026-08-06T05:17:00.000Z');

        const ratingRows = [
            { externalId: 'active', rating: 1800, rd: 70, matches: 40, last: '2026-07-20', opponents: 20 },
            { externalId: 'few-matches', rating: 1750, rd: 70, matches: 5, last: '2026-07-20', opponents: 5 },
            { externalId: 'inactive', rating: 2100, rd: 65, matches: 80, last: '2024-07-20', opponents: 35 },
            { externalId: 'sparse', rating: 1750, rd: 75, matches: 25, last: '2026-07-20', opponents: 2 },
            { externalId: 'uncertain', rating: 1850, rd: 109, matches: 30, last: '2026-07-01', opponents: 15 },
        ];

        for (const row of ratingRows) {
            const playerId = byExternalId.get(row.externalId)!;
            await db.insertInto('player_ratings').values({
                model_id: model.id,
                player_id: playerId,
                rating: row.rating,
                rating_deviation: row.rd,
                volatility: 0.06,
                conservative_rating: row.rating - 2 * row.rd,
                rated_matches: row.matches,
                rated_wins: Math.floor(row.matches / 2),
                rated_losses: row.matches - Math.floor(row.matches / 2),
                first_rated_at: '2020-01-01',
                last_rated_at: row.last,
                provisional: false,
                updated_at: calculatedAt,
            }).execute();
            await db.insertInto('rating_player_coverage').values({
                model_id: model.id,
                player_id: playerId,
                category: 'covered',
                raw_matches: row.matches,
                singles_matches: row.matches,
                normal_singles_matches: row.matches,
                eligible_matches_all_time: row.matches,
                eligible_matches_in_window: row.matches,
                unique_opponents_in_window: row.opponents,
                first_match_date: '2020-01-01',
                last_match_date: row.last,
                rating_exists: true,
                rated_matches: row.matches,
                rating_deviation: row.rd,
                updated_at: calculatedAt,
            }).execute();
        }

        const result = await refreshCurrentRankings(
            db,
            'global-singles-glicko2-v1',
            calculatedAt,
        );
        expect(result.totalPlayers).toBe(5);
        expect(result.rankedPlayers).toBe(2);

        const rankings = await db.selectFrom('rating_current_rankings')
            .selectAll()
            .execute();
        const byPlayer = new Map(rankings.map((ranking: any) => [ranking.player_id, ranking]));
        expect(byPlayer.get(byExternalId.get('active')!)?.eligibility_reason).toBe('ranked');
        expect(byPlayer.get(byExternalId.get('active')!)?.current_rank).toBe(1);
        expect(byPlayer.get(byExternalId.get('few-matches')!)?.eligibility_reason).toBe('ranked');
        expect(byPlayer.get(byExternalId.get('few-matches')!)?.current_rank).toBe(2);
        expect(byPlayer.get(byExternalId.get('inactive')!)?.eligibility_reason).toBe('inactive');
        expect(byPlayer.get(byExternalId.get('inactive')!)!.effective_deviation).toBeGreaterThan(65);
        expect(byPlayer.get(byExternalId.get('sparse')!)?.eligibility_reason).toBe('insufficient_opponents');
        expect(byPlayer.get(byExternalId.get('uncertain')!)?.eligibility_reason).toBe('high_uncertainty');
        expect(byPlayer.get(byExternalId.get('inactive')!)?.historical_rank).toBe(1);
    });
});
