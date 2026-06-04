import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { ParsedTTLeaguesData } from './parser.js';

// ─── Input Type ───────────────────────────────────────────────────────────────

export interface LoadTTLeaguesOptions {
    competitionId: string;
    platformId: string;
    parsedData: ParsedTTLeaguesData;
    scrapeLogIds: string[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Loads parsed TT Leagues data into the database using a single transaction.
 * All UPSERTs use composite unique constraints for idempotency.
 *
 * On success: marks raw_scrape_logs as 'processed'.
 * On failure: marks raw_scrape_logs as 'failed' (outside the rolled-back tx).
 */
export async function loadTTLeaguesData(
    db: Kysely<Database>,
    options: LoadTTLeaguesOptions,
): Promise<void> {
    const { competitionId, platformId, parsedData, scrapeLogIds } = options;

    try {
        await db.transaction().execute(async (trx) => {
            // ── 1. UPSERT teams ───────────────────────────────────────────
            const teamIdMap = new Map<string, string>(); // externalId → DB UUID

            if (parsedData.teams.length > 0) {
                const teamRows = await trx
                    .insertInto('teams')
                    .values(
                        parsedData.teams.map((t) => ({
                            competition_id: competitionId,
                            external_id: t.externalId,
                            name: t.name,
                        })),
                    )
                    .onConflict((oc) =>
                        oc.columns(['competition_id', 'external_id']).doUpdateSet({
                            name: (eb) => eb.ref('excluded.name'),
                        }),
                    )
                    .returning(['id', 'external_id'])
                    .execute();

                for (const row of teamRows) {
                    teamIdMap.set(row.external_id, row.id);
                }
            }

            // ── 2. UPSERT external_players ────────────────────────────────
            const playerIdMap = new Map<string, string>(); // externalId → DB UUID

            if (parsedData.players.length > 0) {
                // Split players with external_id from those without
                const playersWithExtId = parsedData.players.filter(
                    (p) => p.externalId != null && p.externalId !== '',
                );
                const playersWithoutExtId = parsedData.players.filter(
                    (p) => p.externalId == null || p.externalId === '',
                );

                // UPSERT players with external_id (use partial unique index)
                if (playersWithExtId.length > 0) {
                    const playerRows = await trx
                        .insertInto('external_players')
                        .values(
                            playersWithExtId.map((p) => ({
                                platform_id: platformId,
                                external_id: p.externalId,
                                name: p.name,
                                updated_at: new Date(),
                            })),
                        )
                        .onConflict((oc) =>
                            oc
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
                        if (row.external_id) {
                            playerIdMap.set(row.external_id, row.id);
                        }
                    }
                }

                // INSERT players without external_id (no dedup possible)
                if (playersWithoutExtId.length > 0) {
                    const playerRows = await trx
                        .insertInto('external_players')
                        .values(
                            playersWithoutExtId.map((p) => ({
                                platform_id: platformId,
                                external_id: null,
                                name: p.name,
                                updated_at: new Date(),
                            })),
                        )
                        .returning(['id', 'name'])
                        .execute();

                    // Map by name as fallback for unnamed players
                    for (const row of playerRows) {
                        playerIdMap.set(`unnamed_${row.name}`, row.id);
                    }
                }
            }

            // ── 3. UPSERT fixtures ────────────────────────────────────────
            const fixtureIdMap = new Map<string, string>(); // externalId → DB UUID

            if (parsedData.fixtures.length > 0) {
                const fixtureRows = await trx
                    .insertInto('fixtures')
                    .values(
                        parsedData.fixtures.map((f) => {
                            const homeTeamId = teamIdMap.get(f.homeTeamExternalId);
                            const awayTeamId = teamIdMap.get(f.awayTeamExternalId);

                            if (!homeTeamId || !awayTeamId) {
                                throw new Error(
                                    `Team not found for fixture ${f.externalId}: ` +
                                    `home=${f.homeTeamExternalId} (${homeTeamId}), ` +
                                    `away=${f.awayTeamExternalId} (${awayTeamId})`,
                                );
                            }

                            return {
                                competition_id: competitionId,
                                external_id: f.externalId,
                                home_team_id: homeTeamId,
                                away_team_id: awayTeamId,
                                date_played: f.datePlayed,
                                status: f.status,
                                round_name: f.roundName,
                                round_order: f.roundOrder,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((oc) =>
                        oc.columns(['competition_id', 'external_id']).doUpdateSet({
                            home_team_id: (eb) => eb.ref('excluded.home_team_id'),
                            away_team_id: (eb) => eb.ref('excluded.away_team_id'),
                            date_played: (eb) => eb.ref('excluded.date_played'),
                            status: (eb) => eb.ref('excluded.status'),
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

            // ── 4. UPSERT rubbers ─────────────────────────────────────────
            if (parsedData.rubbers.length > 0) {
                await trx
                    .insertInto('rubbers')
                    .values(
                        parsedData.rubbers.map((r) => {
                            const fixtureId = fixtureIdMap.get(r.matchExternalId);
                            if (!fixtureId) {
                                throw new Error(
                                    `Fixture not found for rubber ${r.externalId}: ` +
                                    `matchExternalId=${r.matchExternalId}`,
                                );
                            }

                            const homePlayer1Id = r.homePlayers[0]
                                ? playerIdMap.get(r.homePlayers[0]) ?? null
                                : null;
                            const awayPlayer1Id = r.awayPlayers[0]
                                ? playerIdMap.get(r.awayPlayers[0]) ?? null
                                : null;

                            const homePlayer2Id = r.isDoubles && r.homePlayers[1]
                                ? playerIdMap.get(r.homePlayers[1]) ?? null
                                : null;
                            const awayPlayer2Id = r.isDoubles && r.awayPlayers[1]
                                ? playerIdMap.get(r.awayPlayers[1]) ?? null
                                : null;

                            return {
                                fixture_id: fixtureId,
                                external_id: r.externalId,
                                is_doubles: r.isDoubles,
                                home_player_1_id: homePlayer1Id,
                                home_player_2_id: homePlayer2Id,
                                away_player_1_id: awayPlayer1Id,
                                away_player_2_id: awayPlayer2Id,
                                home_games_won: r.homeGamesWon,
                                away_games_won: r.awayGamesWon,
                                home_points_scored: null,
                                away_points_scored: null,
                                outcome_type: r.outcomeType,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((oc) =>
                        oc.columns(['fixture_id', 'external_id']).doUpdateSet({
                            is_doubles: (eb) => eb.ref('excluded.is_doubles'),
                            home_player_1_id: (eb) => eb.ref('excluded.home_player_1_id'),
                            home_player_2_id: (eb) => eb.ref('excluded.home_player_2_id'),
                            away_player_1_id: (eb) => eb.ref('excluded.away_player_1_id'),
                            away_player_2_id: (eb) => eb.ref('excluded.away_player_2_id'),
                            home_games_won: (eb) => eb.ref('excluded.home_games_won'),
                            away_games_won: (eb) => eb.ref('excluded.away_games_won'),
                            outcome_type: (eb) => eb.ref('excluded.outcome_type'),
                            updated_at: new Date(),
                        }),
                    )
                    .execute();
            }

            // ── 5. UPSERT league_standings ────────────────────────────────
            if (parsedData.standings.length > 0) {
                await trx
                    .insertInto('league_standings')
                    .values(
                        parsedData.standings.map((s) => {
                            const teamId = teamIdMap.get(s.teamExternalId);
                            if (!teamId) {
                                throw new Error(
                                    `Team not found for standing: teamExternalId=${s.teamExternalId}`,
                                );
                            }

                            return {
                                competition_id: competitionId,
                                team_id: teamId,
                                position: s.position,
                                played: s.played,
                                won: s.won,
                                drawn: s.drawn,
                                lost: s.lost,
                                points: s.points,
                                updated_at: new Date(),
                            };
                        }),
                    )
                    .onConflict((oc) =>
                        oc.columns(['competition_id', 'team_id']).doUpdateSet({
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

            // ── 6. Mark scrape logs as processed ──────────────────────────
            if (scrapeLogIds.length > 0) {
                await trx
                    .updateTable('raw_scrape_logs')
                    .set({ status: 'processed' })
                    .where('id', 'in', scrapeLogIds)
                    .execute();
            }
        });
    } catch (error) {
        // Transaction rolled back — mark scrape logs as 'failed' outside the tx
        if (scrapeLogIds.length > 0) {
            await db
                .updateTable('raw_scrape_logs')
                .set({ status: 'failed' })
                .where('id', 'in', scrapeLogIds)
                .execute();
        }

        throw error;
    }
}
