import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Kysely, RawBuilder } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '@tt-players/db';
import {
  rankPlayerRivals,
  type RivalEncounter,
} from '../player-rivals-ranking.js';

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

const ErrorSchema = z.object({
  error: z.string(),
  statusCode: z.number().int(),
});

function uuidArray(ids: string[]): RawBuilder<string[]> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
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
            SELECT COALESCE(ep.canonical_player_id, ep.id) AS canonical_id
            FROM external_players ep
            WHERE ep.id = ${request.params.id}::uuid
              AND ep.deleted_at IS NULL
          )
          SELECT
            pi.canonical_id,
            ARRAY_AGG(DISTINCT source.id) AS source_ids
          FROM player_info pi
          JOIN external_players source
            ON COALESCE(source.canonical_player_id, source.id) = pi.canonical_id
           AND source.deleted_at IS NULL
          GROUP BY pi.canonical_id
        `.execute(db);

        const player = identity.rows[0];
        if (!player) {
          return reply.status(404).send({
            error: `Player ${request.params.id} not found`,
            statusCode: 404,
          });
        }

        const sourceIds = uuidArray(player.source_ids);
        const encounterRows = await sql<{
          encounter_id: string;
          played_at: Date | string;
          opponent_id: string;
          opponent_name: string;
          is_win: boolean;
        }>`
          SELECT
            r.id AS encounter_id,
            COALESCE(f.date_played::timestamp, r.played_at, f.created_at) AS played_at,
            COALESCE(opponent.canonical_player_id, opponent.id) AS opponent_id,
            COALESCE(canonical_opponent.name, opponent.name) AS opponent_name,
            CASE
              WHEN r.home_player_1_id = ANY(${sourceIds})
                THEN r.home_games_won > r.away_games_won
              ELSE r.away_games_won > r.home_games_won
            END AS is_win
          FROM rubbers r
          JOIN fixtures f ON f.id = r.fixture_id
          JOIN competitions c ON c.id = f.competition_id
          JOIN seasons s ON s.id = c.season_id
          JOIN leagues l ON l.id = s.league_id
          JOIN external_players opponent
            ON opponent.id = CASE
              WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.away_player_1_id
              ELSE r.home_player_1_id
            END
          LEFT JOIN external_players canonical_opponent
            ON canonical_opponent.id = COALESCE(opponent.canonical_player_id, opponent.id)
          WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds}))
            AND r.is_doubles = false
            AND r.deleted_at IS NULL
            AND r.outcome_type != 'walkover'
            AND f.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND l.deleted_at IS NULL
            AND opponent.deleted_at IS NULL
            AND (canonical_opponent.id IS NULL OR canonical_opponent.deleted_at IS NULL)
          ORDER BY
            COALESCE(f.date_played::timestamp, r.played_at, f.created_at) ASC,
            r.id ASC
        `.execute(db);

        const encounters: RivalEncounter[] = encounterRows.rows.map((row) => ({
          opponent_id: row.opponent_id,
          opponent_name: row.opponent_name,
          is_win: Boolean(row.is_win),
          played_at: toIso(row.played_at),
          encounter_id: row.encounter_id,
        }));
        const ranked = rankPlayerRivals(encounters, 4);

        return reply.send({
          player_id: player.canonical_id,
          ...ranked,
        });
      },
    );
  };
}
