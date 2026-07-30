import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Database as SourceRegistryDatabase } from './source-registry-types.js';

export type PlayerIdentityDecisionStatus = 'suggested' | 'confirmed' | 'rejected';
export type PlayerIdentityDecisionCreator = 'automatic' | 'manual' | 'user';

export interface PlayerIdentityDecisionsTable {
    id: Generated<string>;
    source_player_id: string;
    canonical_player_id: string;
    status: PlayerIdentityDecisionStatus;
    confidence: number;
    evidence: unknown;
    created_by: PlayerIdentityDecisionCreator;
    decided_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type PlayerIdentityDecision = Selectable<PlayerIdentityDecisionsTable>;
export type NewPlayerIdentityDecision = Insertable<PlayerIdentityDecisionsTable>;
export type PlayerIdentityDecisionUpdate = Updateable<PlayerIdentityDecisionsTable>;

export interface IdentityResolutionDatabase {
    player_identity_decisions: PlayerIdentityDecisionsTable;
}

export interface Database extends SourceRegistryDatabase, IdentityResolutionDatabase {}
