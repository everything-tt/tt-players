import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Kysely, RawBuilder } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '@tt-players/db';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const RivalRecordSchema = z.object({
  opponent_id: z.string().uuid(),
  opponent_name: z.string(),
  played: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  win_rate: z.number().int().min(0).max(100),
});

const ImprovingRivalSchema = z.object({
  opponent_id: z.string().uuid(),
  opponent_name: z.string(),
  played: z.number().int().nonnegative(),
  first_half_win_rate: z.number().int().min(0).max(100),
  second_half_win_rate: z.number().int().min(0).max(100),
  delta_points: z.number().int().positive(),
});

const ResponseSchema = z.object({
  player_id: z.string().uuid(),
  toughest: z.array(RivalRecordSchema),
  easiest: z.array(RivalRecordSchema),
  improving: z.array(ImprovingRivalSchema),
});

type PlayerRivalsResponse = z.infer<typeof ResponseSchema>;

const ErrorSchema = z.object({
  error: z.string(),
  statusCode: z.number().int(),
});

interface RivalQueryRow {
  category: 'toughest' | 'easiest' | 'improving';
  category_rank: number | string;
  opponent_id: string;
  opponent_name: string;
  played: number | string;
  wins: number | string;
  losses: number | string;
  win_rate: number | string;
  first_half_win_rate: number | string | null;
  second_half_win_rate: number | string | null;
  delta_points: number | string | null;
}

const PLAYER_RIVALS_CACHE_TYPE = 'player-rivals-v2';
const PLAYER_RIVALS_CACHE_TTL_MS = Number(
  process.env['PLAYER_RIVALS_CACHE_TTL_MS'] ?? `${60 * 60 * 1000}`,
);

function uuidArray(ids: string[]): RawBuilder<string[]> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function toEpochMs(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(String(value));
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

async function readRivalsCache(
  db: Kysely<Database>,
  cacheKey: string,
  sourceVersion: string,
): Promise<PlayerRivalsResponse | null> {
  const cached = await db
    .selectFrom('cache_entries')
    .select(['content', 'source_version', 'expires_at'])
    .where('type', '=', PLAYER_RIVALS_CACHE_TYPE)
    .where('cache_key', '=', cacheKey)
    .executeTakeFirst();

  if (
    cached
    && cached.source_version === sourceVersion
    && toEpochMs(cached.expires_at) > Date.now()
  ) {
    return cached.content as PlayerRivalsResponse;
  }
  return null;
}

async function writeRivalsCache(
  db: Kysely<Database>,
  cacheKey: string,
  sourceVersion: string,
  payload: PlayerRivalsResponse,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLAYER_RIVALS_CACHE_TTL_MS);
  await db
    .insertInto('cache_entries')
    .values({
      type: PLAYER_RIVALS_CACHE_TYPE,
      cache_key: cacheKey,
      content: payload,
      source_version: sourceVersion,
      expires_at: expiresAt,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.columns(['type', 'cache_key']).doUpdateSet({
      content: payload,
      source_version: sourceVersion,
      expires_at: expiresAt,
      updated_at: now,
    }))
    .execute();
}

export function playerRivalsRoutes(db: Kysely<Database>): FastifyPluginAsync {
  return async function playerRivalsPlugin(fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.get(
      '/:id/rivals',
      {
        schema: {
          params: ParamsSchema,
          response: {
            200: ResponseSchema,
            404: ErrorSchema,
            500: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const identity = await sql<{
          canonical_id: string;
          source_ids: string[];
        }>`
          WITH player_info AS (
            SELECT COALESCE(player.canonical_player_id, player.id) AS canonical_id
            FROM external_players player
            WHERE player.id = ${request.params.id}::uuid
              AND player.deleted_at IS NULL
          )
          SELECT
            player_info.canonical_id,
            ARRAY_AGG(DISTINCT source.id ORDER BY source.id)::uuid[] AS source_ids
          FROM player_info
          JOIN external_players source
            ON COALESCE(source.canonical_player_id, source.id) = player_info.canonical_id
           AND source.deleted_at IS NULL
          GROUP BY player_info.canonical_id
        `.execute(db);

        const player = identity.rows[0];
        if (!player) {
          return reply.status(404).send({
            error: `Player ${request.params.id} not found`,
            statusCode: 404,
          });
        }

        const sourceIds = uuidArray(player.source_ids);
        const versionResult = await sql<{ source_version: string }>`
          WITH relevant_rubbers AS MATERIALIZED (
            SELECT rubber.fixture_id, rubber.updated_at
            FROM rubbers rubber
            WHERE (
              rubber.home_player_1_id = ANY(${sourceIds})
              OR rubber.away_player_1_id = ANY(${sourceIds})
            )
              AND rubber.is_doubles = false
              AND rubber.deleted_at IS NULL
              AND rubber.outcome_type <> 'walkover'
          )
          SELECT GREATEST(
            COALESCE((
              SELECT MAX(GREATEST(relevant.updated_at, fixture.updated_at))
              FROM relevant_rubbers relevant
              JOIN fixtures fixture ON fixture.id = relevant.fixture_id
            ), '-infinity'::timestamp),
            COALESCE((
              SELECT player_row.updated_at
              FROM external_players player_row
              WHERE player_row.deleted_at IS NULL
              ORDER BY player_row.updated_at DESC
              LIMIT 1
            ), '-infinity'::timestamp)
          )::text AS source_version
        `.execute(db);
        const sourceVersion = versionResult.rows[0]?.source_version ?? 'none';

        const cached = await readRivalsCache(db, player.canonical_id, sourceVersion);
        if (cached) return reply.send(cached);

        const result = await sql<RivalQueryRow>`
          WITH relevant AS MATERIALIZED (
            SELECT
              rubber.id AS encounter_id,
              COALESCE(fixture.date_played::timestamp, rubber.played_at, fixture.created_at) AS played_at,
              COALESCE(opponent.canonical_player_id, opponent.id) AS opponent_id,
              COALESCE(canonical_opponent.name, opponent.name) AS opponent_name,
              CASE
                WHEN rubber.home_player_1_id = ANY(${sourceIds})
                  THEN CASE WHEN rubber.home_games_won > rubber.away_games_won THEN 1 ELSE 0 END
                ELSE CASE WHEN rubber.away_games_won > rubber.home_games_won THEN 1 ELSE 0 END
              END::int AS is_win
            FROM rubbers rubber
            JOIN fixtures fixture ON fixture.id = rubber.fixture_id
            JOIN competitions competition ON competition.id = fixture.competition_id
            JOIN seasons season_row ON season_row.id = competition.season_id
            JOIN leagues league ON league.id = season_row.league_id
            JOIN external_players opponent
              ON opponent.id = CASE
                WHEN rubber.home_player_1_id = ANY(${sourceIds}) THEN rubber.away_player_1_id
                ELSE rubber.home_player_1_id
              END
            LEFT JOIN external_players canonical_opponent
              ON canonical_opponent.id = COALESCE(opponent.canonical_player_id, opponent.id)
            WHERE (
              rubber.home_player_1_id = ANY(${sourceIds})
              OR rubber.away_player_1_id = ANY(${sourceIds})
            )
              AND rubber.is_doubles = false
              AND rubber.deleted_at IS NULL
              AND rubber.outcome_type <> 'walkover'
              AND fixture.deleted_at IS NULL
              AND competition.deleted_at IS NULL
              AND season_row.deleted_at IS NULL
              AND league.deleted_at IS NULL
              AND opponent.deleted_at IS NULL
              AND (canonical_opponent.id IS NULL OR canonical_opponent.deleted_at IS NULL)
          ), sequenced AS (
            SELECT
              relevant.*,
              ROW_NUMBER() OVER (
                PARTITION BY opponent_id
                ORDER BY played_at ASC, encounter_id ASC
              )::int AS sequence_number,
              COUNT(*) OVER (PARTITION BY opponent_id)::int AS opponent_played
            FROM relevant
          ), split_rows AS (
            SELECT
              sequenced.*,
              FLOOR(opponent_played / 2.0)::int AS split_at
            FROM sequenced
          ), aggregated AS (
            SELECT
              opponent_id,
              MAX(opponent_name) AS opponent_name,
              COUNT(*)::int AS played,
              SUM(is_win)::int AS wins,
              (COUNT(*) - SUM(is_win))::int AS losses,
              ROUND((SUM(is_win)::numeric / NULLIF(COUNT(*), 0)) * 100)::int AS win_rate,
              ROUND((
                SUM(is_win) FILTER (WHERE sequence_number <= split_at)::numeric
                / NULLIF(COUNT(*) FILTER (WHERE sequence_number <= split_at), 0)
              ) * 100)::int AS first_half_win_rate,
              ROUND((
                SUM(is_win) FILTER (WHERE sequence_number > split_at)::numeric
                / NULLIF(COUNT(*) FILTER (WHERE sequence_number > split_at), 0)
              ) * 100)::int AS second_half_win_rate
            FROM split_rows
            GROUP BY opponent_id
          ), ranked AS (
            SELECT
              aggregated.*,
              ROW_NUMBER() OVER (
                ORDER BY win_rate ASC, played DESC, opponent_name ASC, opponent_id ASC
              )::int AS toughest_rank,
              ROW_NUMBER() OVER (
                ORDER BY win_rate DESC, played DESC, opponent_name ASC, opponent_id ASC
              )::int AS easiest_rank
            FROM aggregated
            WHERE played >= 3
          ), improving AS (
            SELECT
              aggregated.*,
              (second_half_win_rate - first_half_win_rate)::int AS delta_points
            FROM aggregated
            WHERE played >= 4
              AND second_half_win_rate > first_half_win_rate
          ), improving_ranked AS (
            SELECT
              improving.*,
              ROW_NUMBER() OVER (
                ORDER BY delta_points DESC, played DESC, opponent_name ASC, opponent_id ASC
              )::int AS improvement_rank
            FROM improving
          ), categorized AS (
            SELECT
              'toughest'::text AS category,
              toughest_rank AS category_rank,
              opponent_id,
              opponent_name,
              played,
              wins,
              losses,
              win_rate,
              NULL::int AS first_half_win_rate,
              NULL::int AS second_half_win_rate,
              NULL::int AS delta_points
            FROM ranked
            WHERE toughest_rank <= 4

            UNION ALL

            SELECT
              'easiest'::text AS category,
              easiest_rank AS category_rank,
              opponent_id,
              opponent_name,
              played,
              wins,
              losses,
              win_rate,
              NULL::int AS first_half_win_rate,
              NULL::int AS second_half_win_rate,
              NULL::int AS delta_points
            FROM ranked
            WHERE easiest_rank <= 4

            UNION ALL

            SELECT
              'improving'::text AS category,
              improvement_rank AS category_rank,
              opponent_id,
              opponent_name,
              played,
              wins,
              losses,
              win_rate,
              first_half_win_rate,
              second_half_win_rate,
              delta_points
            FROM improving_ranked
            WHERE improvement_rank <= 4
          )
          SELECT *
          FROM categorized
          WHERE category_rank <= 4
          ORDER BY
            CASE category WHEN 'toughest' THEN 1 WHEN 'easiest' THEN 2 ELSE 3 END,
            category_rank
        `.execute(db);

        const payload: PlayerRivalsResponse = {
          player_id: player.canonical_id,
          toughest: [],
          easiest: [],
          improving: [],
        };

        for (const row of result.rows) {
          if (row.category === 'improving') {
            payload.improving.push({
              opponent_id: row.opponent_id,
              opponent_name: row.opponent_name,
              played: Number(row.played),
              first_half_win_rate: Number(row.first_half_win_rate),
              second_half_win_rate: Number(row.second_half_win_rate),
              delta_points: Number(row.delta_points),
            });
          } else {
            payload[row.category].push({
              opponent_id: row.opponent_id,
              opponent_name: row.opponent_name,
              played: Number(row.played),
              wins: Number(row.wins),
              losses: Number(row.losses),
              win_rate: Number(row.win_rate),
            });
          }
        }

        await writeRivalsCache(db, player.canonical_id, sourceVersion, payload);
        return reply.send(payload);
      },
    );
  };
}
