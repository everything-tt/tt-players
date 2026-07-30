import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('player_identity_decisions')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn('source_player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('canonical_player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('suggested'))
        .addColumn('confidence', 'double precision', (col) => col.notNull())
        .addColumn('evidence', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('created_by', 'varchar', (col) => col.notNull().defaultTo('automatic'))
        .addColumn('decided_at', 'timestamp')
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_player_identity_decisions_pair', [
            'source_player_id',
            'canonical_player_id',
        ])
        .addCheckConstraint(
            'ck_player_identity_decisions_status',
            sql`status IN ('suggested', 'confirmed', 'rejected')`,
        )
        .addCheckConstraint(
            'ck_player_identity_decisions_confidence',
            sql`confidence >= 0 AND confidence <= 1`,
        )
        .addCheckConstraint(
            'ck_player_identity_decisions_distinct_players',
            sql`source_player_id <> canonical_player_id`,
        )
        .execute();

    await db.schema
        .createIndex('idx_player_identity_decisions_review')
        .on('player_identity_decisions')
        .columns(['status', 'confidence', 'updated_at'])
        .execute();

    await db.schema
        .createIndex('idx_player_identity_decisions_canonical')
        .on('player_identity_decisions')
        .column('canonical_player_id')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('player_identity_decisions').ifExists().execute();
}
