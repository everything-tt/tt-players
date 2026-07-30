import type { Kysely } from 'kysely';
import type {
    Database,
    PlayerIdentityDecisionCreator,
} from '@tt-players/db';

interface ReconcileLogger {
    info: (msg: string) => void;
}

export interface ReconcilePlayersResult {
    linkedGroups: number;
    suggestedGroups: number;
    suggestedLinks: number;
    remappedRubbers: number;
}

interface ExternalPlayerRow {
    id: string;
    platform_id: string;
    external_id: string | null;
    canonical_player_id: string | null;
    name: string;
}

interface IdentityEvidence {
    rule: string;
    normalized_name?: string;
    source_platform_id?: string;
    canonical_platform_id?: string;
    source_external_id?: string | null;
    canonical_external_id?: string | null;
    reason?: string;
    [key: string]: unknown;
}

const EXACT_NAME_CONFIDENCE = 0.65;

function normalizePlayerName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function chooseCanonicalId(group: ExternalPlayerRow[]): string | null {
    const playerIds = new Set(group.map((player) => player.id));
    const existingCanonical = group.find((player) =>
        player.canonical_player_id != null
        && player.canonical_player_id !== player.id
        && playerIds.has(player.canonical_player_id)
    );

    if (existingCanonical?.canonical_player_id) {
        return existingCanonical.canonical_player_id;
    }

    return group.map((player) => player.id).sort()[0] ?? null;
}

async function upsertSuggestedDecision(
    db: Kysely<Database>,
    source: ExternalPlayerRow,
    canonical: ExternalPlayerRow,
    normalizedName: string,
): Promise<boolean> {
    const existing = await db
        .selectFrom('player_identity_decisions')
        .select(['id', 'status'])
        .where('source_player_id', '=', source.id)
        .where('canonical_player_id', '=', canonical.id)
        .executeTakeFirst();

    if (existing?.status === 'confirmed' || existing?.status === 'rejected') {
        return false;
    }

    const now = new Date();
    const evidence: IdentityEvidence = {
        rule: 'exact-normalized-name',
        normalized_name: normalizedName,
        source_platform_id: source.platform_id,
        canonical_platform_id: canonical.platform_id,
        source_external_id: source.external_id,
        canonical_external_id: canonical.external_id,
    };

    if (existing) {
        await db
            .updateTable('player_identity_decisions')
            .set({
                confidence: EXACT_NAME_CONFIDENCE,
                evidence,
                created_by: 'automatic',
                updated_at: now,
            })
            .where('id', '=', existing.id)
            .execute();
        return false;
    }

    await db
        .insertInto('player_identity_decisions')
        .values({
            source_player_id: source.id,
            canonical_player_id: canonical.id,
            status: 'suggested',
            confidence: EXACT_NAME_CONFIDENCE,
            evidence,
            created_by: 'automatic',
            updated_at: now,
        })
        .execute();
    return true;
}

export async function applyConfirmedIdentityDecisions(
    db: Kysely<Database>,
): Promise<{ appliedLinks: number; linkedGroups: number }> {
    const rows = await db
        .selectFrom('player_identity_decisions as decision')
        .innerJoin('external_players as source', 'source.id', 'decision.source_player_id')
        .innerJoin('external_players as canonical', 'canonical.id', 'decision.canonical_player_id')
        .select([
            'decision.id as decision_id',
            'decision.source_player_id',
            'decision.canonical_player_id',
            'source.canonical_player_id as current_canonical_player_id',
        ])
        .where('decision.status', '=', 'confirmed')
        .where('source.deleted_at', 'is', null)
        .where('canonical.deleted_at', 'is', null)
        .execute();

    let appliedLinks = 0;
    const linkedCanonicalIds = new Set<string>();

    for (const row of rows) {
        if (row.current_canonical_player_id === row.canonical_player_id) continue;

        const now = new Date();
        await db.transaction().execute(async (trx) => {
            await trx
                .updateTable('external_players')
                .set({
                    canonical_player_id: row.canonical_player_id,
                    deleted_at: null,
                    updated_at: now,
                })
                .where('id', '=', row.canonical_player_id)
                .execute();

            await trx
                .updateTable('external_players')
                .set({
                    canonical_player_id: row.canonical_player_id,
                    deleted_at: null,
                    updated_at: now,
                })
                .where('id', '=', row.source_player_id)
                .execute();

            await trx
                .updateTable('player_identity_decisions')
                .set({ decided_at: now, updated_at: now })
                .where('id', '=', row.decision_id)
                .execute();
        });

        appliedLinks += 1;
        linkedCanonicalIds.add(row.canonical_player_id);
    }

    return {
        appliedLinks,
        linkedGroups: linkedCanonicalIds.size,
    };
}

/**
 * Generate reviewable identity suggestions from exact cross-platform name matches.
 * Suggestions never change canonical IDs. Only confirmed decisions are applied.
 */
export async function reconcilePlayersByName(
    db: Kysely<Database>,
    logger?: ReconcileLogger,
): Promise<ReconcilePlayersResult> {
    const applied = await applyConfirmedIdentityDecisions(db);
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

    let suggestedGroups = 0;
    let suggestedLinks = 0;

    for (const [normalizedName, group] of byNormalizedName.entries()) {
        const platformCount = new Set(group.map((player) => player.platform_id)).size;
        if (platformCount < 2) continue;

        const canonicalId = chooseCanonicalId(group);
        if (!canonicalId) continue;
        const canonical = group.find((player) => player.id === canonicalId);
        if (!canonical) continue;

        let groupCreatedSuggestion = false;
        for (const source of group) {
            if (source.id === canonical.id) continue;
            if (source.canonical_player_id === canonical.id) continue;
            if (source.platform_id === canonical.platform_id) continue;

            const created = await upsertSuggestedDecision(
                db,
                source,
                canonical,
                normalizedName,
            );
            if (created) {
                suggestedLinks += 1;
                groupCreatedSuggestion = true;
            }
        }
        if (groupCreatedSuggestion) suggestedGroups += 1;
    }

    logger?.info(
        `reconcilePlayersByName: applied ${applied.appliedLinks} confirmed links across ${applied.linkedGroups} groups, created ${suggestedLinks} suggestions across ${suggestedGroups} groups, remapped 0 rubber refs`,
    );

    return {
        linkedGroups: applied.linkedGroups,
        suggestedGroups,
        suggestedLinks,
        remappedRubbers: 0,
    };
}

async function assertActivePlayers(
    db: Kysely<Database>,
    sourcePlayerId: string,
    canonicalPlayerId: string,
): Promise<void> {
    if (sourcePlayerId === canonicalPlayerId) {
        throw new Error('Source and canonical player must be different');
    }

    const rows = await db
        .selectFrom('external_players')
        .select('id')
        .where('id', 'in', [sourcePlayerId, canonicalPlayerId])
        .where('deleted_at', 'is', null)
        .execute();
    if (rows.length !== 2) {
        throw new Error('Source and canonical players must both exist and be active');
    }
}

export async function confirmPlayerIdentity(
    db: Kysely<Database>,
    sourcePlayerId: string,
    canonicalPlayerId: string,
    evidence: IdentityEvidence = { rule: 'manual-confirmation' },
    createdBy: PlayerIdentityDecisionCreator = 'manual',
): Promise<void> {
    await assertActivePlayers(db, sourcePlayerId, canonicalPlayerId);
    const now = new Date();

    await db
        .insertInto('player_identity_decisions')
        .values({
            source_player_id: sourcePlayerId,
            canonical_player_id: canonicalPlayerId,
            status: 'confirmed',
            confidence: 1,
            evidence,
            created_by: createdBy,
            decided_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['source_player_id', 'canonical_player_id']).doUpdateSet({
                status: 'confirmed',
                confidence: 1,
                evidence,
                created_by: createdBy,
                decided_at: now,
                updated_at: now,
            })
        )
        .execute();

    await applyConfirmedIdentityDecisions(db);
}

export async function rejectPlayerIdentity(
    db: Kysely<Database>,
    sourcePlayerId: string,
    canonicalPlayerId: string,
    evidence: IdentityEvidence = { rule: 'manual-rejection' },
    createdBy: PlayerIdentityDecisionCreator = 'manual',
): Promise<void> {
    await assertActivePlayers(db, sourcePlayerId, canonicalPlayerId);
    const now = new Date();

    await db
        .insertInto('player_identity_decisions')
        .values({
            source_player_id: sourcePlayerId,
            canonical_player_id: canonicalPlayerId,
            status: 'rejected',
            confidence: 0,
            evidence,
            created_by: createdBy,
            decided_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['source_player_id', 'canonical_player_id']).doUpdateSet({
                status: 'rejected',
                confidence: 0,
                evidence,
                created_by: createdBy,
                decided_at: now,
                updated_at: now,
            })
        )
        .execute();
}

export async function unmergePlayer(
    db: Kysely<Database>,
    aliasPlayerId: string,
): Promise<void> {
    const now = new Date();
    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('player_identity_decisions')
            .set({
                status: 'rejected',
                confidence: 0,
                evidence: { rule: 'manual-unmerge', reason: 'alias restored to self' },
                created_by: 'manual',
                decided_at: now,
                updated_at: now,
            })
            .where('source_player_id', '=', aliasPlayerId)
            .where('status', '=', 'confirmed')
            .execute();

        await trx
            .updateTable('external_players')
            .set({
                canonical_player_id: aliasPlayerId,
                deleted_at: null,
                updated_at: now,
            })
            .where('id', '=', aliasPlayerId)
            .execute();
    });
}
