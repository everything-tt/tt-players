import { sql, type Kysely } from 'kysely';
import type { Database, FixtureStatus } from '@tt-players/db';
import type { ParsedTTLeaguesData } from './parser.js';

export interface LoadTTLeaguesOptions {
    competitionId: string;
    platformId: string;
    parsedData: ParsedTTLeaguesData;
    scrapeLogIds: string[];
}

export function resolveFixtureStatusForLoad(
    incomingStatus: FixtureStatus,
    hasRubbers: boolean,
    existingStatus: FixtureStatus | null,
): FixtureStatus {
    if (
        incomingStatus === 'upcoming'
        && !hasRubbers
        && existingStatus === 'completed'
    ) {
        return 'completed';
    }
    return incomingStatus;
}

/**
 * Loads normalized result data atomically.
 *
 * Identity-bearing rows are written with database-enforced UPSERTs so retries
 * and concurrent workers converge. Source players without a stable external ID
 * are deliberately not materialized: callers must provide a stable source ID
 * before a player can participate in the canonical player graph.
 */
export async function loadTTLeaguesData(
    db: Kysely<Database>,
    options: LoadTTLeaguesOptions,
): Promise<void> {
    const { competitionId, platformId, parsedData, scrapeLogIds } = options;

    try {
        await db.transaction().execute(async (trx) => {
            const teamIdMap = new Map<string, string>();

            if (parsedData.teams.length > 0) {
                const teamRows = await trx
                    .insertInto('teams')
                    .values(
                        parsedData.teams.map((team) => ({
                            competition_id: competitionId,
                            external_id: team.externalId,
                            name: team.name,
                        })),
                    )
                    .onConflict((conflict) =>
                        conflict.columns(['competition_id', 'external_id']).doUpdateSet({
                            name: (eb) => eb.ref('excluded.name'),
                        }),
                    )
                    .returning(['id', 'external_id'])
                    .execute();

                for (const row of teamRows) {
                    teamIdMap.set(row.external_id, row.id);
                }
            }

            const playerIdMap = new Map<string, string>();
            const sourceLinkedPlayers = parsedData.players.filter(
                (player) => player.externalId != null && player.externalId !== '',
            );

            if (sourceLinkedPlayers.length > 0) {
                const playerRows = await trx
                    .insertInto('external_players')
                    .values(
                        sourceLinkedPlayers.map((player) => ({
                            platform_id: platformId,
                            external_id: player.externalId,
                            name: player.name,
                            updated_at: new Date(),
                        })),
                    )
                    .onConflict((conflict) =>
                        conflict
                            .columns(['platform_id', 'external_id'])
                            .where('external_id', 'is not', null)
                            .doUpdateSet({
                                name: (eb) => eb.ref('excluded.name'),
                                updated_at: new Date(),
                            }),
                    )
                    .returning(['id', 'external_id'])
                    .execute();

                for (const row of playerRows) {
                    if (row.external_id) playerIdMap.set(row.external_id, row.id);
                }
            }

            const fixtureIdMap = new Map<string, string>();
            if (parsedData.fixtures.length > 0) {
                const fixtureRows = await trx
                    .insertInto('fixtures')
                    .values(
                        parsedData.fixtures.map((fixture) => {
                            const homeTeamId = fixture.homeTeamExternalId
                                ? teamIdMap.get(fixture.homeTeamExternalId)
                                : null;
                            const awayTeamId = fixture.awayTeamExternalId
                                ? teamIdMap.get(fixture.awayTeamExternalId)
                                : null;

                            if (
                                (fixture.homeTeamExternalId && !homeTeamId)
                                || (fixture.awayTeamExternalId && !awayTeamId)
                            ) {
                                throw new Error(
                                    `Team not found for fixture ${fixture.externalId}: `
                                    + `home=${fixture.homeTeamExternalId} (${homeTeamId}), `
                                    + `away=${fixture.awayTeamExternalId} (${awayTeamId})`,
                                );
                            }

                            return {
                                competition_id: competitionId,
                                external_id: fixture.externalId,
                                home_team_id: homeTeamId,
                                away_team_id: awayTeamId,
                                date_played: fixture.datePlayed,
                                status: fixture.status,
                                round_name: fixture.roundName,
                                round_order: fixture.roundOrder,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((conflict) =>
                        conflict.columns(['competition_id', 'external_id']).doUpdateSet({
                            home_team_id: (eb) => eb.ref('excluded.home_team_id'),
                            away_team_id: (eb) => eb.ref('excluded.away_team_id'),
                            date_played: (eb) => eb.ref('excluded.date_played'),
                            // A stale fixtures snapshot must never regress a result
                            // already known to be completed. Keeping this decision
                            // in the UPSERT makes it safe across worker replicas.
                            status: sql<FixtureStatus>`case
                                when fixtures.status = 'completed'
                                 and excluded.status = 'upcoming'
                                then fixtures.status
                                else excluded.status
                            end`,
                            round_name: (eb) => eb.ref('excluded.round_name'),
                            round_order: (eb) => eb.ref('excluded.round_order'),
                            updated_at: new Date(),
                        }),
                    )
                    .returning(['id', 'external_id'])
                    .execute();

                for (const row of fixtureRows) {
                    fixtureIdMap.set(row.external_id, row.id);
                }
            }

            if (parsedData.rubbers.length > 0) {
                await trx
                    .insertInto('rubbers')
                    .values(
                        parsedData.rubbers.map((rubber) => {
                            const fixtureId = fixtureIdMap.get(rubber.matchExternalId);
                            if (!fixtureId) {
                                throw new Error(
                                    `Fixture not found for rubber ${rubber.externalId}: `
                                    + `matchExternalId=${rubber.matchExternalId}`,
                                );
                            }

                            const homePlayer1Id = rubber.homePlayers[0]
                                ? playerIdMap.get(rubber.homePlayers[0]) ?? null
                                : null;
                            const awayPlayer1Id = rubber.awayPlayers[0]
                                ? playerIdMap.get(rubber.awayPlayers[0]) ?? null
                                : null;
                            const homePlayer2Id = rubber.isDoubles && rubber.homePlayers[1]
                                ? playerIdMap.get(rubber.homePlayers[1]) ?? null
                                : null;
                            const awayPlayer2Id = rubber.isDoubles && rubber.awayPlayers[1]
                                ? playerIdMap.get(rubber.awayPlayers[1]) ?? null
                                : null;

                            return {
                                fixture_id: fixtureId,
                                external_id: rubber.externalId,
                                is_doubles: rubber.isDoubles,
                                home_player_1_id: homePlayer1Id,
                                home_player_2_id: homePlayer2Id,
                                away_player_1_id: awayPlayer1Id,
                                away_player_2_id: awayPlayer2Id,
                                home_games_won: rubber.homeGamesWon,
                                away_games_won: rubber.awayGamesWon,
                                home_points_scored: null,
                                away_points_scored: null,
                                outcome_type: rubber.outcomeType,
                                score_source: rubber.scoreSource ?? 'games',
                                played_at: rubber.playedAt ?? null,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((conflict) =>
                        conflict.columns(['fixture_id', 'external_id']).doUpdateSet({
                            is_doubles: (eb) => eb.ref('excluded.is_doubles'),
                            home_player_1_id: (eb) => eb.ref('excluded.home_player_1_id'),
                            home_player_2_id: (eb) => eb.ref('excluded.home_player_2_id'),
                            away_player_1_id: (eb) => eb.ref('excluded.away_player_1_id'),
                            away_player_2_id: (eb) => eb.ref('excluded.away_player_2_id'),
                            home_games_won: (eb) => eb.ref('excluded.home_games_won'),
                            away_games_won: (eb) => eb.ref('excluded.away_games_won'),
                            outcome_type: (eb) => eb.ref('excluded.outcome_type'),
                            score_source: (eb) => eb.ref('excluded.score_source'),
                            played_at: (eb) => eb.ref('excluded.played_at'),
                            updated_at: new Date(),
                        }),
                    )
                    .execute();
            }

            if (parsedData.standings.length > 0) {
                await trx
                    .insertInto('league_standings')
                    .values(
                        parsedData.standings.map((standing) => {
                            const teamId = teamIdMap.get(standing.teamExternalId);
                            if (!teamId) {
                                throw new Error(
                                    `Team not found for standing: teamExternalId=${standing.teamExternalId}`,
                                );
                            }
                            return {
                                competition_id: competitionId,
                                team_id: teamId,
                                position: standing.position,
                                played: standing.played,
                                won: standing.won,
                                drawn: standing.drawn,
                                lost: standing.lost,
                                points: standing.points,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((conflict) =>
                        conflict.columns(['competition_id', 'team_id']).doUpdateSet({
                            position: (eb) => eb.ref('excluded.position'),
                            played: (eb) => eb.ref('excluded.played'),
                            won: (eb) => eb.ref('excluded.won'),
                            drawn: (eb) => eb.ref('excluded.drawn'),
                            lost: (eb) => eb.ref('excluded.lost'),
                            points: (eb) => eb.ref('excluded.points'),
                            updated_at: new Date(),
                        }),
                    )
                    .execute();
            }

            if (scrapeLogIds.length > 0) {
                await trx
                    .updateTable('staging.raw_scrape_logs')
                    .set({ status: 'processed', updated_at: new Date() })
                    .where('id', 'in', scrapeLogIds)
                    .execute();
            }
        });
    } catch (error) {
        if (scrapeLogIds.length > 0) {
            // A duplicate/stale invocation may fail after another worker has
            // already committed the same evidence. Never regress processed
            // evidence back to failed.
            await db
                .updateTable('staging.raw_scrape_logs')
                .set({ status: 'failed', updated_at: new Date() })
                .where('id', 'in', scrapeLogIds)
                .where('status', '!=', 'processed')
                .execute();
        }
        throw error;
    }
}
