import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

interface ReconcileLogger {
    info: (msg: string) => void;
}

export interface ReconcilePlayersResult {
    linkedGroups: number;
    remappedRubbers: number;
}

interface ExternalPlayerRow {
    id: string;
    platform_id: string;
    external_id: string | null;
    canonical_player_id: string | null;
    name: string;
}

function normalizePlayerName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function chooseCanonicalId(group: ExternalPlayerRow[]): string | null {
    const playerIds = new Set(group.map((p) => p.id));
    const existingCanonical = group.find(
        (p) => p.canonical_player_id != null && playerIds.has(p.canonical_player_id),
    );

    if (existingCanonical?.canonical_player_id) {
        return existingCanonical.canonical_player_id;
    }

    return group.map((p) => p.id).sort()[0] ?? null;
}

/**
 * Auto-link cross-platform players when the match is high-confidence:
 * - exact normalized name match
 * - exactly two rows with that name
 * - rows belong to different platforms
 * - both rows have external IDs
 * - name looks like a full name (contains whitespace)
 */
export async function reconcilePlayersByName(
    db: Kysely<Database>,
    logger?: ReconcileLogger,
): Promise<ReconcilePlayersResult> {
    const players = await db
        .selectFrom('external_players')
        .select(['id', 'platform_id', 'external_id', 'canonical_player_id', 'name'])
        .where('deleted_at', 'is', null)
        .execute() as ExternalPlayerRow[];

    const byNormalizedName = new Map<string, ExternalPlayerRow[]>();
    for (const player of players) {
        const normalized = normalizePlayerName(player.name);
        if (!normalized || !normalized.includes(' ')) continue;
        if (!player.external_id) continue;

        const bucket = byNormalizedName.get(normalized) ?? [];
        bucket.push(player);
        byNormalizedName.set(normalized, bucket);
    }

    let linkedGroups = 0;
    const now = new Date();

    for (const group of byNormalizedName.values()) {
        if (group.length !== 2) continue;

        const platformCount = new Set(group.map((p) => p.platform_id)).size;
        if (platformCount !== 2) continue;

        const canonicalId = chooseCanonicalId(group);
        if (!canonicalId) continue;

        const aliases = group.filter((p) => p.id !== canonicalId);
        if (aliases.length === 0) continue;

        linkedGroups++;

        // Keep the canonical row self-referential for easier lookups.
        await db
            .updateTable('external_players')
            .set({
                canonical_player_id: canonicalId,
                deleted_at: null,
                updated_at: now,
            })
            .where('id', '=', canonicalId)
            .execute();

        // Point all members of the linked group to the same canonical ID.
        await db
            .updateTable('external_players')
            .set({
                canonical_player_id: canonicalId,
                deleted_at: null,
                updated_at: now,
            })
            .where('id', 'in', group.map((p) => p.id))
            .execute();
    }

    logger?.info(
        `reconcilePlayersByName: linked ${linkedGroups} groups, remapped 0 rubber player refs`,
    );

    return {
        linkedGroups,
        remappedRubbers: 0,
    };
}

export async function unmergePlayer(
    db: Kysely<Database>,
    aliasPlayerId: string,
): Promise<void> {
    await db
        .updateTable('external_players')
        .set({
            canonical_player_id: aliasPlayerId,
            deleted_at: null,
            updated_at: new Date(),
        })
        .where('id', '=', aliasPlayerId)
        .execute();
}
