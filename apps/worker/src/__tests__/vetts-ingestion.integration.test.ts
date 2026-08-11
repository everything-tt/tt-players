import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import { VETTS_ADAPTER_VERSION } from '../vetts-adapter.js';
import { syncVettsTournament } from '../vetts-sync.js';

const { Pool } = pg;
const TOURNAMENT_ID = '4af81622-d21a-47ed-a046-86c492b4cfe9';
const EMPTY_TOURNAMENT_ID = '769534f2-8229-4b33-bf34-cd35c9cd7d73';
const CANCELLED_TOURNAMENT_ID = '5a6c9ec0-27e3-424c-bc3c-39e141dd877e';
const UPCOMING_TOURNAMENT_ID = '7fdf7523-4d43-4b43-b3a2-551f41e80f5b';
const TOURNAMENT_URL = `https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}`;
const TEST_DATABASE_NAME = `tt_players_vetts_ingestion_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DATABASE_NAME}`;
const dbPackageDirectory = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'packages', 'db');

let db: Kysely<Database>;

const overviewHtml = `
<html>
<head><title>VETTS Nationals 2026 | VETTS</title></head>
<body>
<main>
  <section><h2>VETTS Nationals 2026</h2><p>Veterans English Table Tennis Society | Wolverhampton 16 May to 17 May</p></section>
  <dl><dt>Events</dt><dd>24</dd><dt>Entries</dt><dd>310</dd></dl>
  <section><h3>Venue</h3><h5>Aldersley Leisure Village</h5><p>Aldersley Road</p><p>WV6 9NW Wolverhampton</p></section>
</main>
</body>
</html>`;

const emptyMatchesHtml = '<table class="matches"><tbody></tbody></table>';
const cancelledOverviewHtml = overviewHtml.replaceAll('VETTS Nationals 2026', 'VETTS Northern 2020 CANCELLED');
const upcomingOverviewHtml = overviewHtml
    .replaceAll('VETTS Nationals 2026', 'VETTS North East Masters 2026')
    .replace('16 May to 17 May', '29 December to 30 December');
const matchesHtml = `
<table class="matches">
<tbody>
<tr>
  <td>08:30</td>
  <td><a href="/sport/draw.aspx?draw=917&id=${TOURNAMENT_ID}">O70 Men's Singles - Group C 1</a><span class="round">Round 1</span></td>
  <td class="participant winner"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=849">Alan Pearse</a></td>
  <td><span class="score">13</span><span class="score">11</span><span class="score">11</span><span class="score">7</span><span class="score">11</span><span class="score">9</span></td>
  <td class="participant"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=6797">Raymond Sutton</a></td>
  <td><a href="/sport/match.aspx?id=${TOURNAMENT_ID}&match=abc-123&T1P1MemberID=1017&T2P1MemberID=6797">Details</a></td>
</tr>
</tbody>
</table>`;

async function recreateDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await admin.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
        await admin.query(`ALTER DATABASE ${TEST_DATABASE_NAME} SET search_path TO public, staging`);
    } finally {
        await admin.end();
    }

    const migration = spawnSync('pnpm', ['exec', 'tsx', 'src/migrate.ts'], {
        cwd: dbPackageDirectory,
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        encoding: 'utf8',
        timeout: 120_000,
    });
    if (migration.status !== 0) {
        throw new Error(
            `VETTS test migration failed.\nstdout:\n${migration.stdout}\nstderr:\n${migration.stderr}`,
        );
    }
}

async function dropDatabase(): Promise<void> {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await admin.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
    } finally {
        await admin.end();
    }
}

describe('VETTS ingestion integration', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
    }, 120_000);

    afterAll(async () => {
        vi.unstubAllGlobals();
        await dropDatabase();
    }, 30_000);

    it('imports a representative tournament end to end without double-counting on rerun', async () => {
        const calendarPlatform = await db
            .insertInto('platforms')
            .values({ name: 'Table Tennis England', base_url: 'https://www.tabletennisengland.co.uk' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const calendarLeague = await db
            .insertInto('leagues')
            .values({
                platform_id: calendarPlatform.id,
                external_id: 'tte-calendar-events',
                name: 'Table Tennis England Competition Events',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const calendarSeason = await db
            .insertInto('seasons')
            .values({
                league_id: calendarLeague.id,
                external_id: 'tte-events-2025-2026',
                name: 'TTE Events 2025/26',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const competition = await (db as Kysely<any>)
            .insertInto('competitions')
            .values({
                season_id: calendarSeason.id,
                external_id: 'tte:event:vetts-nationals-2026',
                name: 'VETTS Nationals 2026',
                display_name: 'VETTS Nationals 2026',
                type: 'individual',
                source: 'tte-calendar',
                source_url: 'https://www.vetts.org.uk/tournaments.aspx?year=2026',
                start_date: '2026-05-16',
                end_date: '2026-05-17',
                venue_name: 'Aldersley Leisure Village',
                venue_town: 'Wolverhampton',
                venue_postcode: 'WV6 9NW',
                event_status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const sport80Platform = await db
            .insertInto('platforms')
            .values({ name: 'Sport:80', base_url: 'https://tabletennisengland.sport80.com' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const canonicalPlayers = await db
            .insertInto('external_players')
            .values([
                { platform_id: sport80Platform.id, external_id: 'sport80:1017', name: 'Alan Pearse' },
                { platform_id: sport80Platform.id, external_id: 'sport80:6797', name: 'Raymond Sutton' },
            ])
            .returning('id')
            .execute();
        const canonicalFixture = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition.id,
                external_id: 'sport80:event:917:2026-05-17',
                date_played: '2026-05-17',
                status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const canonicalRubber = await db
            .insertInto('rubbers')
            .values({
                fixture_id: canonicalFixture.id,
                external_id: 'sport80:result:abc-123',
                home_player_1_id: canonicalPlayers[0]!.id,
                away_player_1_id: canonicalPlayers[1]!.id,
                home_games_won: 3,
                away_games_won: 0,
                outcome_type: 'normal',
                score_source: 'games',
                played_at: '2026-05-17 08:30:00',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url === TOURNAMENT_URL) {
                return new Response(overviewHtml, { status: 200 });
            }
            if (url === `${TOURNAMENT_URL}/matches/20260516`) {
                return new Response(emptyMatchesHtml, { status: 200 });
            }
            if (url === `${TOURNAMENT_URL}/matches/20260517`) {
                return new Response(matchesHtml, { status: 200 });
            }
            throw new Error(`Unexpected VETTS URL in integration test: ${url}`);
        }));

        for (let run = 0; run < 2; run += 1) {
            const result = await syncVettsTournament(db, TOURNAMENT_ID);
            expect(result).toMatchObject({
                tournamentId: TOURNAMENT_ID,
                competitionId: competition.id,
                matchRows: 1,
                rejectedRows: 0,
                duplicateLinks: 1,
                duplicateConflicts: 0,
            });
        }

        const vettsPlatform = await db
            .selectFrom('platforms')
            .select('id')
            .where('base_url', '=', 'https://www.tournamentsoftware.com')
            .executeTakeFirstOrThrow();
        const sourceEvents = await db
            .selectFrom('staging.source_events')
            .select(sql<number>`count(*)::int`.as('count'))
            .where('source', '=', 'vetts-tournamentsoftware')
            .executeTakeFirstOrThrow();
        const sourceRows = await db
            .selectFrom('staging.source_event_result_rows')
            .select(['canonical_rubber_id', sql<number>`count(*) over ()::int`.as('count')])
            .where('source', '=', 'vetts-tournamentsoftware')
            .execute();
        const vettsPlayers = await db
            .selectFrom('external_players')
            .select(['external_id', sql<number>`count(*) over ()::int`.as('count')])
            .where('platform_id', '=', vettsPlatform.id)
            .orderBy('external_id')
            .execute();
        const vettsRubbers = await db
            .selectFrom('rubbers as rubber')
            .innerJoin('fixtures as fixture', 'fixture.id', 'rubber.fixture_id')
            .select(['rubber.id', 'rubber.deleted_at'])
            .where('fixture.competition_id', '=', competition.id)
            .where('rubber.external_id', '=', 'vetts:match:abc-123')
            .execute();
        const activeRubbers = await db
            .selectFrom('rubbers as rubber')
            .innerJoin('fixtures as fixture', 'fixture.id', 'rubber.fixture_id')
            .select(sql<number>`count(*)::int`.as('count'))
            .where('fixture.competition_id', '=', competition.id)
            .where('rubber.deleted_at', 'is', null)
            .executeTakeFirstOrThrow();
        const resources = await db
            .selectFrom('source_resources')
            .select(['resource_type', 'adapter_version', 'last_succeeded_at', 'consecutive_failures'])
            .where('competition_id', '=', competition.id)
            .orderBy('resource_type')
            .execute();
        const rawLogs = await db
            .selectFrom('staging.raw_scrape_logs')
            .select(['endpoint_url', 'status', sql<number>`count(*) over ()::int`.as('count')])
            .where('endpoint_url', 'like', `${TOURNAMENT_URL}%`)
            .orderBy('endpoint_url')
            .execute();
        const sourceLink = await (db as Kysely<any>)
            .selectFrom('tournament_sources')
            .select(['competition_id', 'match_method'])
            .where('provider', '=', 'vetts')
            .where('source_key', '=', TOURNAMENT_ID)
            .executeTakeFirstOrThrow();

        expect(sourceLink).toMatchObject({
            competition_id: competition.id,
            match_method: 'automatic',
        });
        expect(sourceEvents.count).toBe(1);
        expect(sourceRows).toEqual([
            expect.objectContaining({ count: 1, canonical_rubber_id: canonicalRubber.id }),
        ]);
        expect(vettsPlayers).toEqual([
            expect.objectContaining({
                count: 2,
                external_id: 'tournamentsoftware:vetts:member:1017',
            }),
            expect.objectContaining({
                count: 2,
                external_id: 'tournamentsoftware:vetts:member:6797',
            }),
        ]);
        expect(vettsRubbers).toHaveLength(1);
        expect(vettsRubbers[0]!.deleted_at).not.toBeNull();
        expect(activeRubbers.count).toBe(1);
        expect(resources).toHaveLength(2);
        expect(resources).toEqual([
            expect.objectContaining({
                resource_type: 'event',
                adapter_version: VETTS_ADAPTER_VERSION,
                consecutive_failures: 0,
                last_succeeded_at: expect.any(Date),
            }),
            expect.objectContaining({
                resource_type: 'event-results',
                adapter_version: VETTS_ADAPTER_VERSION,
                consecutive_failures: 0,
                last_succeeded_at: expect.any(Date),
            }),
        ]);
        expect(rawLogs).toHaveLength(3);
        expect(rawLogs.every((row) => row.status === 'processed' && row.count === 3)).toBe(true);
    }, 120_000);

    it('fails closed when a completed tournament has no parsed matches', async () => {
        const overviewUrl = `https://vetts.tournamentsoftware.com/tournament/${EMPTY_TOURNAMENT_ID}`;
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url === overviewUrl) {
                return new Response(overviewHtml, { status: 200 });
            }
            if (url === `${overviewUrl}/matches/20260516` || url === `${overviewUrl}/matches/20260517`) {
                return new Response(emptyMatchesHtml, { status: 200 });
            }
            throw new Error(`Unexpected empty VETTS URL in integration test: ${url}`);
        }));

        await expect(syncVettsTournament(db, EMPTY_TOURNAMENT_ID)).rejects.toThrow(
            `VETTS completed tournament ${EMPTY_TOURNAMENT_ID} produced no parsed matches`,
        );

        const resultsResource = await db
            .selectFrom('source_resources')
            .select(['consecutive_failures', 'last_error'])
            .where('resource_type', '=', 'event-results')
            .where('external_id', '=', `${EMPTY_TOURNAMENT_ID}:matches`)
            .executeTakeFirstOrThrow();
        expect(resultsResource.consecutive_failures).toBe(1);
        expect(resultsResource.last_error).toContain('produced no parsed matches');
    }, 120_000);

    it('records dated cancelled tournaments without treating zero results as a parser failure', async () => {
        const overviewUrl = `https://vetts.tournamentsoftware.com/tournament/${CANCELLED_TOURNAMENT_ID}`;
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url === overviewUrl) {
                return new Response(cancelledOverviewHtml, { status: 200 });
            }
            if (url === `${overviewUrl}/matches/20200516` || url === `${overviewUrl}/matches/20200517`) {
                return new Response(emptyMatchesHtml, { status: 200 });
            }
            throw new Error(`Unexpected cancelled VETTS URL in integration test: ${url}`);
        }));

        const result = await syncVettsTournament(db, CANCELLED_TOURNAMENT_ID);
        expect(result).toMatchObject({
            tournamentId: CANCELLED_TOURNAMENT_ID,
            matchRows: 0,
            rejectedRows: 0,
        });

        const competition = await (db as Kysely<any>)
            .selectFrom('competitions')
            .select(['event_status', 'publication_status', 'record_kind', 'deleted_at'])
            .where('external_id', '=', `vetts:tournament:${CANCELLED_TOURNAMENT_ID}`)
            .executeTakeFirstOrThrow();
        expect(competition).toMatchObject({
            event_status: 'cancelled',
            publication_status: 'cancelled',
            record_kind: 'calendar',
            deleted_at: null,
        });

        const resultsResource = await db
            .selectFrom('source_resources')
            .select(['consecutive_failures', 'last_error', 'last_succeeded_at'])
            .where('resource_type', '=', 'event-results')
            .where('external_id', '=', `${CANCELLED_TOURNAMENT_ID}:matches`)
            .executeTakeFirstOrThrow();
        expect(resultsResource).toMatchObject({
            consecutive_failures: 0,
            last_error: null,
            last_succeeded_at: expect.any(Date),
        });
    }, 120_000);

    it('keeps a future tournament out of the completed result lifecycle', async () => {
        const overviewUrl = `https://vetts.tournamentsoftware.com/tournament/${UPCOMING_TOURNAMENT_ID}`;
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url === overviewUrl) {
                return new Response(upcomingOverviewHtml, { status: 200 });
            }
            if (url === `${overviewUrl}/matches/20261229` || url === `${overviewUrl}/matches/20261230`) {
                return new Response(emptyMatchesHtml, { status: 200 });
            }
            throw new Error(`Unexpected upcoming VETTS URL in integration test: ${url}`);
        }));

        const result = await syncVettsTournament(db, UPCOMING_TOURNAMENT_ID);
        expect(result).toMatchObject({
            tournamentId: UPCOMING_TOURNAMENT_ID,
            matchRows: 0,
            rejectedRows: 0,
        });

        const competition = await (db as Kysely<any>)
            .selectFrom('competitions')
            .select(['event_status', 'publication_status', 'record_kind', 'processed_at', 'deleted_at'])
            .where('external_id', '=', `vetts:tournament:${UPCOMING_TOURNAMENT_ID}`)
            .executeTakeFirstOrThrow();
        expect(competition).toMatchObject({
            event_status: 'upcoming',
            publication_status: null,
            record_kind: 'calendar',
            processed_at: null,
            deleted_at: null,
        });
    }, 120_000);
});
