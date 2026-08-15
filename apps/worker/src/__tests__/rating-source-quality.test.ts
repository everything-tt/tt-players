import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
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
import * as m044 from '@tt-players/db/src/migrations/044_create_rating_source_quality.js';
import { refreshRatingSourceQuality } from '../ratings/rating-source-quality.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rating_source_quality_worker_test_${process.pid}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

let db: Kysely<Database>;

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
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m035.up(db);
    await m040.up(db);
    await m042.up(db);
    await m043.up(db);
    await m044.up(db);
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

describe('rating source quality materialisation', () => {
    it('builds source scorecards and candidate/date issues from rubbers', async () => {
        const platform = await db.insertInto('platforms').values({
            name: 'Materialisation Platform',
            base_url: 'https://materialisation.example',
        }).returning('id').executeTakeFirstOrThrow();
        const league = await db.insertInto('leagues').values({
            platform_id: platform.id,
            external_id: 'league',
            name: 'Materialisation League',
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const season = await db.insertInto('seasons').values({
            league_id: league.id,
            external_id: 'season',
            name: 'Season',
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const competition = await db.insertInto('competitions').values({
            season_id: season.id,
            external_id: 'competition',
            name: 'Materialisation Competition',
            type: 'individual',
            last_scraped_at: null,
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const players = await db.insertInto('external_players').values([
            {
                platform_id: platform.id,
                external_id: 'player-a',
                canonical_player_id: null,
                name: 'Player A',
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                platform_id: platform.id,
                external_id: 'player-b',
                canonical_player_id: null,
                name: 'Player B',
                updated_at: new Date(),
                deleted_at: null,
            },
        ]).returning(['id', 'name']).execute();
        const playerA = players.find((player) => player.name === 'Player A')!;
        const playerB = players.find((player) => player.name === 'Player B')!;

        const fixtures = await db.insertInto('fixtures').values([
            {
                competition_id: competition.id,
                external_id: 'fixture-1',
                home_team_id: null,
                away_team_id: null,
                date_played: '2026-07-01',
                status: 'completed',
                round_name: 'R1',
                round_order: 1,
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                competition_id: competition.id,
                external_id: 'fixture-2',
                home_team_id: null,
                away_team_id: null,
                date_played: '2026-07-01',
                status: 'completed',
                round_name: 'R2',
                round_order: 2,
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                competition_id: competition.id,
                external_id: 'fixture-old',
                home_team_id: null,
                away_team_id: null,
                date_played: '1919-11-19',
                status: 'completed',
                round_name: 'Archive',
                round_order: 3,
                updated_at: new Date(),
                deleted_at: null,
            },
        ]).returning(['id', 'external_id']).execute();
        const fixture1 = fixtures.find((fixture) => fixture.external_id === 'fixture-1')!;
        const fixture2 = fixtures.find((fixture) => fixture.external_id === 'fixture-2')!;
        const oldFixture = fixtures.find((fixture) => fixture.external_id === 'fixture-old')!;

        await db.insertInto('rubbers').values([
            {
                fixture_id: fixture1.id,
                external_id: 'rubber-1',
                is_doubles: false,
                home_player_1_id: playerA.id,
                home_player_2_id: null,
                away_player_1_id: playerB.id,
                away_player_2_id: null,
                home_games_won: 3,
                away_games_won: 1,
                home_points_scored: null,
                away_points_scored: null,
                outcome_type: 'normal',
                score_source: 'games',
                played_at: '2026-07-20T10:00:00.000Z',
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                fixture_id: fixture2.id,
                external_id: 'rubber-2',
                is_doubles: false,
                home_player_1_id: playerA.id,
                home_player_2_id: null,
                away_player_1_id: playerB.id,
                away_player_2_id: null,
                home_games_won: 1,
                away_games_won: 3,
                home_points_scored: null,
                away_points_scored: null,
                outcome_type: 'normal',
                score_source: 'games',
                played_at: '2026-07-20T11:00:00.000Z',
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                fixture_id: oldFixture.id,
                external_id: 'rubber-old',
                is_doubles: false,
                home_player_1_id: playerA.id,
                home_player_2_id: null,
                away_player_1_id: playerB.id,
                away_player_2_id: null,
                home_games_won: 3,
                away_games_won: 0,
                home_points_scored: null,
                away_points_scored: null,
                outcome_type: 'normal',
                score_source: 'games',
                played_at: null,
                updated_at: new Date(),
                deleted_at: null,
            },
        ]).execute();

        const issueCount = await refreshRatingSourceQuality(
            db,
            new Date('2026-08-06T05:17:00.000Z'),
        );
        expect(issueCount).toBeGreaterThanOrEqual(4);

        const source = await db.selectFrom('rating_source_quality')
            .selectAll()
            .where('source_id', '=', platform.id)
            .executeTakeFirstOrThrow();
        expect(source.total_rubbers).toBe(3);
        expect(source.eligible_rubbers).toBe(3);
        expect(source.suspicious_date_rubbers).toBe(1);
        expect(source.duplicate_candidate_groups).toBe(1);
        expect(source.conflicting_candidate_groups).toBe(1);

        const candidate = await db.selectFrom('rating_duplicate_candidate_groups')
            .selectAll()
            .executeTakeFirstOrThrow();
        expect(candidate.candidate_type).toBe('conflicting_score_candidate');
        expect(candidate.rubber_count).toBe(2);

        const issues = await db.selectFrom('rating_audit_issues')
            .select(['issue_type', 'entity_type'])
            .where('resolved_at', 'is', null)
            .execute();
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ issue_type: 'suspicious_old_date', entity_type: 'rubber' }),
            expect.objectContaining({ issue_type: 'fixture_rubber_date_conflict', entity_type: 'rubber' }),
            expect.objectContaining({ issue_type: 'conflicting_duplicate_candidate', entity_type: 'duplicate_group' }),
        ]));
    });
});
