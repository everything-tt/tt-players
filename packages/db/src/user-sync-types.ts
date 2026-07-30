import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface UserSyncStatesTable {
    user_id: string;
    version: number;
    data: unknown;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type UserSyncState = Selectable<UserSyncStatesTable>;
export type NewUserSyncState = Insertable<UserSyncStatesTable>;
export type UserSyncStateUpdate = Updateable<UserSyncStatesTable>;

export interface UserSyncDatabase {
    user_sync_states: UserSyncStatesTable;
}
