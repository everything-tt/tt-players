import type { Task } from 'graphile-worker';
import { db, type RankingListKind } from '@tt-players/db';
import { fetchSport80RankingTable } from '../sport80-client.js';
import {
    booleanFromSport80,
    extractSport80AthleteId,
    numberOrNull,
    parseSport80RankingPlayerName,
    sport80RankingPlayerExternalId,
} from '../sport80-parser.js';
import {
    upsertSport80Platform,
    upsertSport80Player,
    upsertSport80RankingCategory,
    upsertSport80RankingPeriod,
} from '../sport80-loader.js';

export interface ScrapeSport80RankingTablePayload {
    categoryEndpointId: string;
    subcategoryId: string;
    subcategoryName: string;
    periodId: string;
    periodLabel: string;
    periodEndDate?: string | null;
    showRatingsList: 0 | 1;
}

export const scrapeSport80RankingTableTask: Task = async (payload, helpers) => {
    const {
        categoryEndpointId,
        subcategoryId,
        subcategoryName,
        periodId,
        periodLabel,
        periodEndDate = null,
        showRatingsList,
    } = payload as ScrapeSport80RankingTablePayload;

    const platformId = await upsertSport80Platform(db);
    const categoryId = await upsertSport80RankingCategory(
        db,
        platformId,
        subcategoryId,
        subcategoryName,
    );
    const rankingPeriodId = await upsertSport80RankingPeriod(
        db,
        platformId,
        periodId,
        periodLabel,
        periodEndDate,
    );

    const response = await fetchSport80RankingTable({
        categoryEndpointId,
        period: periodId,
        subcategory: subcategoryId,
        showRatingsList,
    });
    const listKind: RankingListKind = showRatingsList === 1 ? 'rating' : 'ranking';

    helpers.logger.info(
        `scrapeSport80RankingTableTask: category ${subcategoryId}, period ${periodId}, ${listKind}, ${response.data.length} rows`,
    );

    if (response.data.length === 0) return;

    const entriesByPlayer = new Map<string, {
        period_id: string;
        category_id: string;
        player_id: string;
        list_kind: RankingListKind;
        ranking_row_external_id: string;
        athlete_external_id: string | null;
        rank: number | null;
        points: number | null;
        county_country: string | null;
        inactive_periods: number | null;
        is_initial_rating: boolean;
        updated_at: Date;
    }>();
    for (const row of response.data) {
        const player = parseSport80RankingPlayerName(row.name);
        if (!player.name) {
            helpers.logger.info(
                `scrapeSport80RankingTableTask: skipping row ${row.id} without player name`,
            );
            continue;
        }
        const playerExternalId = sport80RankingPlayerExternalId(player);
        const playerId = await upsertSport80Player(db, platformId, playerExternalId, player.name);

        const key = `${playerId}:${listKind}`;
        if (entriesByPlayer.has(key)) continue;

        entriesByPlayer.set(key, {
            period_id: rankingPeriodId,
            category_id: categoryId,
            player_id: playerId,
            list_kind: listKind,
            ranking_row_external_id: String(row.id),
            athlete_external_id: extractSport80AthleteId(row.action),
            rank: numberOrNull(row.rank),
            points: numberOrNull(row.points),
            county_country: row.county_country ?? null,
            inactive_periods: numberOrNull(row.inactive_periods),
            is_initial_rating: booleanFromSport80(row.is_initial_rating),
            updated_at: new Date(),
        });
    }

    const entries = Array.from(entriesByPlayer.values());
    if (entries.length === 0) return;

    await db
        .insertInto('ranking_entries')
        .values(entries)
        .onConflict((oc) =>
            oc.columns(['period_id', 'category_id', 'player_id', 'list_kind']).doUpdateSet({
                ranking_row_external_id: (eb) => eb.ref('excluded.ranking_row_external_id'),
                athlete_external_id: (eb) => eb.ref('excluded.athlete_external_id'),
                rank: (eb) => eb.ref('excluded.rank'),
                points: (eb) => eb.ref('excluded.points'),
                county_country: (eb) => eb.ref('excluded.county_country'),
                inactive_periods: (eb) => eb.ref('excluded.inactive_periods'),
                is_initial_rating: (eb) => eb.ref('excluded.is_initial_rating'),
                updated_at: new Date(),
            }),
        )
        .execute();
};
