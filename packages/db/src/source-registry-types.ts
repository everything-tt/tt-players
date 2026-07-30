import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Database as CoreDatabase } from './types.js';

export interface SourceInstancesTable {
    id: Generated<string>;
    platform_id: string;
    key: string;
    name: string;
    base_url: string;
    adapter_key: string;
    enabled: Generated<boolean>;
    config: unknown;
    first_seen_at: Generated<Date>;
    last_seen_at: ColumnType<Date, Date | undefined, Date>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceInstance = Selectable<SourceInstancesTable>;
export type NewSourceInstance = Insertable<SourceInstancesTable>;
export type SourceInstanceUpdate = Updateable<SourceInstancesTable>;

export interface SourceResourcesTable {
    id: Generated<string>;
    source_instance_id: string;
    resource_type: string;
    external_id: string;
    name: string | null;
    public_url: string | null;
    adapter_version: string;
    refresh_policy: unknown;
    enabled: Generated<boolean>;
    league_id: string | null;
    season_id: string | null;
    competition_id: string | null;
    last_fetched_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_succeeded_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_parsed_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_error: string | null;
    consecutive_failures: Generated<number>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceResource = Selectable<SourceResourcesTable>;
export type NewSourceResource = Insertable<SourceResourcesTable>;
export type SourceResourceUpdate = Updateable<SourceResourcesTable>;

export interface SourceRegistryDatabase {
    source_instances: SourceInstancesTable;
    source_resources: SourceResourcesTable;
}

export interface Database extends CoreDatabase, SourceRegistryDatabase {}
