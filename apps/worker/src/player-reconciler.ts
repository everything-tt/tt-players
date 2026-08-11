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

interface SuggestedDecisionCandidate {
    source_player_id: string;
    canonical_player_id: string;
    confidence: number;
    evidence: IdentityEvidence;
    group_key: string;
}

/**
 * Insert new review suggestions in one batch. Existing confirmed/rejected
 * decisions are immutable, and existing suggestions already contain the
 * same deterministic evidence, so neither needs a per-pair write.
 */
async function insertReviewSuggestions(
    db: Kysely<Database>,
    candidates: SuggestedDecisionCandidate[],
): Promise<{ suggestedGroups: number; suggestedLinks: number }> {
    if (candidates.length === 0) {
        return { suggestedGroups: 0, suggestedLinks: 0 };
    }

    const uniqueCandidates = new Map<string, SuggestedDecisionCandidate>();
    for (const candidate of candidates) {
        const key = `${candidate.source_player_id}:${candidate.canonical_player_id}`;
        if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, candidate);
    }

    const existing = await db
        .selectFrom('player_identity_decisions')
        .select(['source_player_id', 'canonical_player_id', 'status'])
        .execute();
    const existingPairs = new Set(
        existing.map((decision) => `${decision.source_player_id}:${decision.canonical_player_id}`),
    );
    const rows = Array.from(uniqueCandidates.entries())
        .filter(([key]) => !existingPairs.has(key))
        .map(([, candidate]) => ({
            source_player_id: candidate.source_player_id,
            canonical_player_id: candidate.canonical_player_id,
            status: 'suggested' as const,
            confidence: candidate.confidence,
            evidence: candidate.evidence,
            created_by: 'automatic' as const,
            updated_at: new Date(),
        }));

    if (rows.length === 0) {
        return { suggestedGroups: 0, suggestedLinks: 0 };
    }

    const inserted = await db
        .insertInto('player_identity_decisions')
        .values(rows)
        .onConflict((conflict) =>
            conflict.columns(['source_player_id', 'canonical_player_id']).doNothing()
        )
        .returning(['source_player_id', 'canonical_player_id'])
        .execute();

    const insertedGroups = new Set<string>();
    for (const decision of inserted) {
        const key = `${decision.source_player_id}:${decision.canonical_player_id}`;
        const candidate = uniqueCandidates.get(key);
        if (candidate) insertedGroups.add(candidate.group_key);
    }

    return {
        suggestedGroups: insertedGroups.size,
        suggestedLinks: inserted.length,
    };
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

    const crossPlatformCandidates: SuggestedDecisionCandidate[] = [];

    for (const [normalizedName, group] of byNormalizedName.entries()) {
        const platformCount = new Set(group.map((player) => player.platform_id)).size;
        if (platformCount < 2) continue;

        const canonicalId = chooseCanonicalId(group);
        if (!canonicalId) continue;
        const canonical = group.find((player) => player.id === canonicalId);
        if (!canonical) continue;

        for (const source of group) {
            if (source.id === canonical.id) continue;
            if (source.canonical_player_id === canonical.id) continue;
            if (source.platform_id === canonical.platform_id) continue;

            crossPlatformCandidates.push({
                source_player_id: source.id,
                canonical_player_id: canonical.id,
                confidence: EXACT_NAME_CONFIDENCE,
                evidence: {
                    rule: 'exact-normalized-name',
                    normalized_name: normalizedName,
                    source_platform_id: source.platform_id,
                    canonical_platform_id: canonical.platform_id,
                    source_external_id: source.external_id,
                    canonical_external_id: canonical.external_id,
                },
                group_key: normalizedName,
            });
        }
    }

    const crossPlatform = await insertReviewSuggestions(db, crossPlatformCandidates);

    // Same-platform pass: suggest merges for players with the same name
    // who play in the same league on the same platform.
    const samePlatform = await reconcileSamePlatformByLeague(db, logger);

    logger?.info(
        `reconcilePlayersByName: applied ${applied.appliedLinks} confirmed links across ${applied.linkedGroups} groups, created ${crossPlatform.suggestedLinks} cross-platform + ${samePlatform.suggestedLinks} same-platform suggestions, remapped 0 rubber refs`,
    );

    return {
        linkedGroups: applied.linkedGroups,
        suggestedGroups: crossPlatform.suggestedGroups + samePlatform.suggestedGroups,
        suggestedLinks: crossPlatform.suggestedLinks + samePlatform.suggestedLinks,
        remappedRubbers: 0,
    };
}

/**
 * Generate identity suggestions for same-platform players who share the same
 * normalized name AND have played in the same league. This catches cases where
 * a single person has multiple source profiles (e.g. different TT365 player
 * IDs across seasons in the same local league) that the cross-platform pass
 * skips due to the same-platform guard.
 *
 * Suggestions use rule 'same-platform-same-league' with confidence 0.8.
 * "Unknown Player" entries are excluded.
 */
const SAME_PLATFORM_SAME_LEAGUE_CONFIDENCE = 0.8;

interface PlayerLeagueRow {
    player_id: string;
    platform_id: string;
    external_id: string | null;
    canonical_player_id: string;
    name: string;
    league_id: string;
    league_name: string;
}

function effectivePlayerCanonicalId(player: PlayerLeagueRow): string {
    return player.canonical_player_id ?? player.player_id;
}

export async function reconcileSamePlatformByLeague(
    db: Kysely<Database>,
    logger?: ReconcileLogger,
): Promise<{ suggestedGroups: number; suggestedLinks: number }> {
    // Get all (player, league) pairs for active players with external_ids.
    // Using UNION ALL to avoid OR conditions in joins.
    const homePlayerLeagues = db
        .selectFrom('external_players as ep')
        .innerJoin('rubbers as r', 'r.home_player_1_id', 'ep.id')
        .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
        .innerJoin('competitions as c', 'c.id', 'f.competition_id')
        .innerJoin('seasons as s', 's.id', 'c.season_id')
        .innerJoin('leagues as l', 'l.id', 's.league_id')
        .where('ep.deleted_at', 'is', null)
        .where('r.deleted_at', 'is', null)
        .where('ep.external_id', 'is not', null)
        .where('ep.name', '!=', 'Unknown Player')
        .select([
            'ep.id as player_id',
            'ep.platform_id as platform_id',
            'ep.external_id as external_id',
            'ep.canonical_player_id as canonical_player_id',
            'ep.name as name',
            'l.id as league_id',
            'l.name as league_name',
        ]);

    const allPlayerLeagues = await db
        .selectFrom('external_players as ep')
        .innerJoin('rubbers as r', 'r.away_player_1_id', 'ep.id')
        .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
        .innerJoin('competitions as c', 'c.id', 'f.competition_id')
        .innerJoin('seasons as s', 's.id', 'c.season_id')
        .innerJoin('leagues as l', 'l.id', 's.league_id')
        .where('ep.deleted_at', 'is', null)
        .where('r.deleted_at', 'is', null)
        .where('ep.external_id', 'is not', null)
        .where('ep.name', '!=', 'Unknown Player')
        .select([
            'ep.id as player_id',
            'ep.platform_id as platform_id',
            'ep.external_id as external_id',
            'ep.canonical_player_id as canonical_player_id',
            'ep.name as name',
            'l.id as league_id',
            'l.name as league_name',
        ])
        .unionAll(homePlayerLeagues)
        .execute() as PlayerLeagueRow[];

    // Group by (platform_id, normalized_name, league_id) to find same-platform
    // same-name same-league groups with multiple distinct canonicals.
    const groups = new Map<string, PlayerLeagueRow[]>();
    for (const row of allPlayerLeagues) {
        const normName = normalizePlayerName(row.name);
        if (!normName || !normName.includes(' ')) continue;
        const key = `${row.platform_id}|${normName}|${row.league_id}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(row);
        groups.set(key, bucket);
    }

    const samePlatformCandidates: SuggestedDecisionCandidate[] = [];

    for (const group of groups.values()) {
        // Deduplicate by player_id (a player may have multiple rubbers in the same league)
        const byPlayer = new Map<string, PlayerLeagueRow>();
        for (const row of group) {
            if (!byPlayer.has(row.player_id)) {
                byPlayer.set(row.player_id, row);
            }
        }
        const uniquePlayers = Array.from(byPlayer.values());
        if (uniquePlayers.length < 2) continue;

        // Check if they have different canonical_player_ids
        const canonicalIds = new Set(uniquePlayers.map(effectivePlayerCanonicalId));
        if (canonicalIds.size < 2) continue;

        // Pick canonical root: prefer the one with the most rubbers (most active)
        const canonical = uniquePlayers.sort((a, b) =>
            effectivePlayerCanonicalId(a) < effectivePlayerCanonicalId(b) ? -1 : 1,
        )[0]!;

        const leagueName = uniquePlayers[0]!.league_name;

        for (const source of uniquePlayers) {
            if (source.player_id === canonical.player_id) continue;
            if (effectivePlayerCanonicalId(source) === effectivePlayerCanonicalId(canonical)) continue;

            samePlatformCandidates.push({
                source_player_id: source.player_id,
                canonical_player_id: canonical.player_id,
                confidence: SAME_PLATFORM_SAME_LEAGUE_CONFIDENCE,
                evidence: {
                    rule: 'same-platform-same-league',
                    normalized_name: normalizePlayerName(source.name),
                    source_platform_id: source.platform_id,
                    canonical_platform_id: canonical.platform_id,
                    source_external_id: source.external_id,
                    canonical_external_id: canonical.external_id,
                    league_name: leagueName,
                    reason: 'Same normalized name on same platform in same league',
                },
                group_key: `${source.platform_id}|${normalizePlayerName(source.name)}|${canonical.league_id}`,
            });
        }
    }

    const suggestions = await insertReviewSuggestions(db, samePlatformCandidates);

    logger?.info(
        `reconcileSamePlatformByLeague: created ${suggestions.suggestedLinks} same-platform suggestions across ${suggestions.suggestedGroups} groups`,
    );

    return suggestions;
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
