import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { Sport80EventResultTableRow, Sport80EventTableRow } from './sport80-client.js';
import {
    parseSport80PlayerCell,
    parseSport80Round,
    sport80PlayerExternalId,
    sport80Timestamp,
} from './sport80-parser.js';

export const SPORT80_PLATFORM_NAME = 'Sport:80 Table Tennis England Rankings';
export const SPORT80_PLATFORM_BASE_URL = 'https://tabletennisengland.sport80.com/public/rankings';
export const SPORT80_LEAGUE_EXTERNAL_ID = 'sport80-tte-rankings';
export const SPORT80_LEAGUE_NAME = 'Table Tennis England Rankings';
export const SPORT80_SOURCE = 'sport80';

function jsonPayload(value: unknown): unknown {
    return typeof value === 'string' ? { value } : value;
}

export async function upsertSport80Platform(db: Kysely<Database>): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select('id')
        .where('name', '=', SPORT80_PLATFORM_NAME)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('platforms')
        .values({
            name: SPORT80_PLATFORM_NAME,
            base_url: SPORT80_PLATFORM_BASE_URL,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80League(
    db: Kysely<Database>,
    platformId: string,
): Promise<string> {
    const existing = await db
        .selectFrom('leagues')
        .select('id')
        .where('platform_id', '=', platformId)
        .where('external_id', '=', SPORT80_LEAGUE_EXTERNAL_ID)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('leagues')
        .values({
            platform_id: platformId,
            external_id: SPORT80_LEAGUE_EXTERNAL_ID,
            name: SPORT80_LEAGUE_NAME,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80Player(
    db: Kysely<Database>,
    platformId: string,
    externalId: string,
    name: string,
): Promise<string> {
    const row = await db
        .insertInto('external_players')
        .values({
            platform_id: platformId,
            external_id: externalId,
            name,
            updated_at: new Date(),
        })
        .onConflict((oc) =>
            oc
                .columns(['platform_id', 'external_id'])
                .where('external_id', 'is not', null)
                .doUpdateSet({
                    name: (eb) => eb.ref('excluded.name'),
                    updated_at: new Date(),
                }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80RankingCategory(
    db: Kysely<Database>,
    platformId: string,
    externalId: string,
    name: string,
): Promise<string> {
    const row = await db
        .insertInto('staging.ranking_categories')
        .values({
            platform_id: platformId,
            external_id: externalId,
            name,
            updated_at: new Date(),
        })
        .onConflict((oc) =>
            oc.columns(['platform_id', 'external_id']).doUpdateSet({
                name: (eb) => eb.ref('excluded.name'),
                updated_at: new Date(),
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80RankingPeriod(
    db: Kysely<Database>,
    platformId: string,
    externalId: string,
    label: string,
    periodEndDate: string | null,
): Promise<string> {
    const row = await db
        .insertInto('staging.ranking_periods')
        .values({
            platform_id: platformId,
            external_id: externalId,
            label,
            period_end_date: periodEndDate,
            updated_at: new Date(),
        })
        .onConflict((oc) =>
            oc.columns(['platform_id', 'external_id']).doUpdateSet({
                label: (eb) => eb.ref('excluded.label'),
                period_end_date: (eb) => eb.ref('excluded.period_end_date'),
                updated_at: new Date(),
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80SourceEvent(
    db: Kysely<Database>,
    platformId: string,
    event: {
        id: string;
        name: string;
        date: string | null;
        category?: string | null;
        raw: Sport80EventTableRow | Record<string, unknown>;
        canonicalCompetitionId?: string | null;
    },
): Promise<string> {
    const now = new Date();
    const publicUrl = `https://tabletennisengland.sport80.com/public/rankings/results/${event.id}`;
    const row = await db
        .insertInto('staging.source_events')
        .values({
            platform_id: platformId,
            source: SPORT80_SOURCE,
            external_id: event.id,
            name: event.name,
            event_date: event.date,
            category: event.category ?? null,
            public_url: publicUrl,
            raw_payload: event.raw,
            canonical_competition_id: event.canonicalCompetitionId ?? null,
            last_seen_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['source', 'external_id']).doUpdateSet({
                name: (eb: any) => eb.ref('excluded.name'),
                event_date: (eb: any) => eb.ref('excluded.event_date'),
                category: (eb: any) => eb.ref('excluded.category'),
                public_url: (eb: any) => eb.ref('excluded.public_url'),
                raw_payload: (eb: any) => eb.ref('excluded.raw_payload'),
                canonical_competition_id: sql`coalesce(excluded.canonical_competition_id, source_events.canonical_competition_id)`,
                last_seen_at: now,
                updated_at: now,
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export async function upsertSport80SourceEventResultRows(
    db: Kysely<Database>,
    sourceEventId: string,
    rows: Sport80EventResultTableRow[],
): Promise<void> {
    if (rows.length === 0) return;

    const values = rows.map((row) => {
        const home = parseSport80PlayerCell(row.home);
        const away = parseSport80PlayerCell(row.away);
        if (home.isWinner === away.isWinner) {
            throw new Error(`Sport80 result row ${row.id} does not contain exactly one winner`);
        }

        const { roundName, roundOrder } = parseSport80Round(row.round);
        const winnerSide = home.isWinner ? 'home' : 'away';
        const now = new Date();

        return {
            source_event_id: sourceEventId,
            source: SPORT80_SOURCE,
            external_id: String(row.id),
            played_at: sport80Timestamp(row.date_and_time),
            round_name: roundName,
            round_order: roundOrder,
            round_raw: row.round == null ? {} : jsonPayload(row.round),
            home_raw: row.home,
            away_raw: row.away,
            home_player_name: home.name,
            home_player_external_id: sport80PlayerExternalId(home),
            away_player_name: away.name,
            away_player_external_id: sport80PlayerExternalId(away),
            winner_side: winnerSide,
            raw_payload: row,
            last_seen_at: now,
            updated_at: now,
        };
    });

    await db
        .insertInto('staging.source_event_result_rows')
        .values(values)
        .onConflict((oc) =>
            oc.columns(['source', 'external_id']).doUpdateSet({
                source_event_id: (eb: any) => eb.ref('excluded.source_event_id'),
                played_at: (eb: any) => eb.ref('excluded.played_at'),
                round_name: (eb: any) => eb.ref('excluded.round_name'),
                round_order: (eb: any) => eb.ref('excluded.round_order'),
                round_raw: (eb: any) => eb.ref('excluded.round_raw'),
                home_raw: (eb: any) => eb.ref('excluded.home_raw'),
                away_raw: (eb: any) => eb.ref('excluded.away_raw'),
                home_player_name: (eb: any) => eb.ref('excluded.home_player_name'),
                home_player_external_id: (eb: any) => eb.ref('excluded.home_player_external_id'),
                away_player_name: (eb: any) => eb.ref('excluded.away_player_name'),
                away_player_external_id: (eb: any) => eb.ref('excluded.away_player_external_id'),
                winner_side: (eb: any) => eb.ref('excluded.winner_side'),
                raw_payload: (eb: any) => eb.ref('excluded.raw_payload'),
                last_seen_at: new Date(),
                updated_at: new Date(),
            }),
        )
        .execute();
}
