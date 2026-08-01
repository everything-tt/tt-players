import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Every alias must resolve directly to a stable root. A chain such as
    // source -> former canonical -> current canonical causes one-hop API
    // queries to miss matches recorded against the older source identity.
    await sql`
        DO $migration$
        DECLARE
            unresolved_count integer;
        BEGIN
            WITH RECURSIVE lineage AS (
                SELECT
                    ep.id AS source_id,
                    ep.id AS current_id,
                    ep.canonical_player_id AS next_id,
                    ARRAY[ep.id]::uuid[] AS path
                FROM external_players ep

                UNION ALL

                SELECT
                    lineage.source_id,
                    parent.id AS current_id,
                    parent.canonical_player_id AS next_id,
                    lineage.path || parent.id
                FROM lineage
                JOIN external_players parent ON parent.id = lineage.next_id
                WHERE lineage.next_id IS NOT NULL
                  AND lineage.next_id <> lineage.current_id
                  AND NOT parent.id = ANY(lineage.path)
            ), roots AS (
                SELECT DISTINCT ON (source_id)
                    source_id,
                    current_id AS root_id
                FROM lineage
                WHERE next_id IS NULL OR next_id = current_id
                ORDER BY source_id, cardinality(path) DESC
            )
            SELECT COUNT(*)::int
            INTO unresolved_count
            FROM external_players ep
            LEFT JOIN roots ON roots.source_id = ep.id
            WHERE roots.source_id IS NULL;

            IF unresolved_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot flatten canonical player identities: % player(s) are part of a cycle',
                    unresolved_count;
            END IF;
        END
        $migration$
    `.execute(db);

    await sql`
        WITH RECURSIVE lineage AS (
            SELECT
                ep.id AS source_id,
                ep.id AS current_id,
                ep.canonical_player_id AS next_id,
                ARRAY[ep.id]::uuid[] AS path
            FROM external_players ep

            UNION ALL

            SELECT
                lineage.source_id,
                parent.id AS current_id,
                parent.canonical_player_id AS next_id,
                lineage.path || parent.id
            FROM lineage
            JOIN external_players parent ON parent.id = lineage.next_id
            WHERE lineage.next_id IS NOT NULL
              AND lineage.next_id <> lineage.current_id
              AND NOT parent.id = ANY(lineage.path)
        ), roots AS (
            SELECT DISTINCT ON (source_id)
                source_id,
                current_id AS root_id
            FROM lineage
            WHERE next_id IS NULL OR next_id = current_id
            ORDER BY source_id, cardinality(path) DESC
        )
        UPDATE external_players ep
        SET canonical_player_id = roots.root_id
        FROM roots
        WHERE ep.id = roots.source_id
          AND ep.canonical_player_id IS DISTINCT FROM roots.root_id
    `.execute(db);

    // Resolve the requested canonical target to its root before every write so
    // new aliases cannot introduce another multi-hop chain.
    await sql`
        CREATE OR REPLACE FUNCTION flatten_external_player_canonical_target()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        DECLARE
            target_id uuid;
            parent_target_id uuid;
            visited uuid[];
        BEGIN
            IF NEW.canonical_player_id IS NULL OR NEW.canonical_player_id = NEW.id THEN
                NEW.canonical_player_id := NEW.id;
                RETURN NEW;
            END IF;

            target_id := NEW.canonical_player_id;
            visited := ARRAY[NEW.id]::uuid[];

            LOOP
                IF target_id = ANY(visited) THEN
                    RAISE EXCEPTION
                        'Canonical player identity cycle involving % and %',
                        NEW.id,
                        target_id
                        USING ERRCODE = '23514';
                END IF;

                visited := visited || target_id;

                SELECT ep.canonical_player_id
                INTO parent_target_id
                FROM external_players ep
                WHERE ep.id = target_id;

                IF NOT FOUND THEN
                    -- The foreign key will provide the normal missing-target
                    -- error after the trigger returns.
                    RETURN NEW;
                END IF;

                IF parent_target_id IS NULL OR parent_target_id = target_id THEN
                    NEW.canonical_player_id := target_id;
                    RETURN NEW;
                END IF;

                target_id := parent_target_id;
            END LOOP;
        END
        $function$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_flatten_external_player_canonical_insert
        BEFORE INSERT ON external_players
        FOR EACH ROW
        EXECUTE FUNCTION flatten_external_player_canonical_target()
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_flatten_external_player_canonical_update
        BEFORE UPDATE OF canonical_player_id ON external_players
        FOR EACH ROW
        EXECUTE FUNCTION flatten_external_player_canonical_target()
    `.execute(db);

    // If a canonical player is subsequently linked to a newer root, reparent
    // all direct aliases. Their own AFTER triggers cascade the repair through
    // any deeper descendants in the same transaction.
    await sql`
        CREATE OR REPLACE FUNCTION reparent_external_player_aliases()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        BEGIN
            IF NEW.canonical_player_id IS DISTINCT FROM OLD.canonical_player_id THEN
                UPDATE external_players
                SET canonical_player_id = NEW.canonical_player_id
                WHERE canonical_player_id = NEW.id
                  AND id <> NEW.id
                  AND canonical_player_id IS DISTINCT FROM NEW.canonical_player_id;
            END IF;

            RETURN NEW;
        END
        $function$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_reparent_external_player_aliases
        AFTER UPDATE OF canonical_player_id ON external_players
        FOR EACH ROW
        EXECUTE FUNCTION reparent_external_player_aliases()
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP TRIGGER IF EXISTS trg_reparent_external_player_aliases
        ON external_players
    `.execute(db);
    await sql`
        DROP FUNCTION IF EXISTS reparent_external_player_aliases()
    `.execute(db);
    await sql`
        DROP TRIGGER IF EXISTS trg_flatten_external_player_canonical_update
        ON external_players
    `.execute(db);
    await sql`
        DROP TRIGGER IF EXISTS trg_flatten_external_player_canonical_insert
        ON external_players
    `.execute(db);
    await sql`
        DROP FUNCTION IF EXISTS flatten_external_player_canonical_target()
    `.execute(db);
}
