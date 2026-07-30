import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Database as IdentityResolutionDatabase } from './identity-resolution-types.js';
import type { RankingListKind } from './types.js';

export interface OfficialRankingSnapshotsTable {
    id: Generated<string>;
    platform_id: string;
    player_id: string;
    source_category_external_id: string;
    category_name: string;
    source_period_external_id: string;
    period_label: string;
    period_end_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
    list_kind: RankingListKind;
    ranking_row_external_id: string | null;
    athlete_external_id: string | null;
    rank: number | null;
    points: number | null;
    county_country: string | null;
    inactive_periods: number | null;
    is_initial_rating: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type OfficialRankingSnapshot = Selectable<OfficialRankingSnapshotsTable>;
export type NewOfficialRankingSnapshot = Insertable<OfficialRankingSnapshotsTable>;
export type OfficialRankingSnapshotUpdate = Updateable<OfficialRankingSnapshotsTable>;

export interface OfficialRankingDatabase {
    official_ranking_snapshots: OfficialRankingSnapshotsTable;
}

export interface Database extends IdentityResolutionDatabase, OfficialRankingDatabase {}
