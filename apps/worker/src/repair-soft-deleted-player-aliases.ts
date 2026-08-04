import dotenv from 'dotenv';
import { db, type Database } from '@tt-players/db';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { refreshApiReadModels } from './read-models.js';

dotenv.config();

const RepairTargetSchema = z.union([z.literal('all'), z.string().uuid()]);

const CliOptionsSchema = z.object({
    target: RepairTargetSchema,
    apply: z.boolean(),
});

type RepairTarget = z.infer<typeof RepairTargetSchema>;

interface RepairCandidate {
    alias_id: string;
    alias_name: string;
    alias_external_id: string | null;
    canonical_id: string;
    canonical_name: string;
    deleted_at: Date | string;
    referenced_rubbers: number | string;
}

interface SerializedRepairCandidate {
    aliasId: string;
    aliasName: string;
    aliasExternalId: string | null;
    canonicalId: string;
    canonicalName: string;
    deletedAt: string;
    referencedRubbers: number;
}

export interface RepairSoftDeletedPlayerAliasesResult {
    mode: 'preview' | 'apply';
    scope: 'all' | 'single';
    canonicalPlayerId: string | null;
    candidateCount: number;
    canonicalPlayerCount: number;
    referencedRubberLinks: number;
    candidates: SerializedRepairCandidate[];
    restoredAliasIds: string[];
}

function parseCliOptions(argv: string[]) {
    const canonicalIndex = argv.indexOf('--canonical-player-id');
    const canonicalPlayerId = canonicalIndex >= 0 ? argv[canonicalIndex + 1] : undefined;
    const repairAll = argv.includes('--all');

    if (repairAll && canonicalPlayerId) {
        throw new Error('Use either --all or --canonical-player-id, not both');
    }
    if (!repairAll && !canonicalPlayerId) {
        throw new Error('Provide --all or --canonical-player-id <uuid>');
    }

    return CliOptionsSchema.parse({
        target: repairAll ? 'all' : canonicalPlayerId,
        apply: argv.includes('--apply'),
    });
}

function candidateQuery(database: Kysely<Database>, canonicalPlayerId?: string) {
    let query = database
        .selectFrom('external_players as alias')
        .innerJoin('external_players as canonical', 'canonical.id', 'alias.canonical_player_id')
        .innerJoin('rubbers as rubber', (join) =>
            join
                .on((eb) => eb.or([
                    eb('rubber.home_player_1_id', '=', eb.ref('alias.id')),
                    eb('rubber.home_player_2_id', '=', eb.ref('alias.id')),
                    eb('rubber.away_player_1_id', '=', eb.ref('alias.id')),
                    eb('rubber.away_player_2_id', '=', eb.ref('alias.id')),
                ]))
                .on('rubber.deleted_at', 'is', null),
        )
        .select([
            'alias.id as alias_id',
            'alias.name as alias_name',
            'alias.external_id as alias_external_id',
            'canonical.id as canonical_id',
            'canonical.name as canonical_name',
            'alias.deleted_at',
        ])
        .select((eb) => eb.fn.count<number>('rubber.id').distinct().as('referenced_rubbers'))
        .whereRef('alias.id', '!=', 'canonical.id')
        .where('alias.deleted_at', 'is not', null)
        .where('canonical.deleted_at', 'is', null)
        .where('canonical.canonical_player_id', 'is', null);

    if (canonicalPlayerId) {
        query = query.where('alias.canonical_player_id', '=', canonicalPlayerId);
    }

    return query
        .groupBy([
            'alias.id',
            'alias.name',
            'alias.external_id',
            'canonical.id',
            'canonical.name',
            'alias.deleted_at',
        ])
        .orderBy('canonical.name', 'asc')
        .orderBy('canonical.id', 'asc')
        .orderBy('referenced_rubbers', 'desc')
        .orderBy('alias.id', 'asc');
}

function serializeCandidates(candidates: RepairCandidate[]): SerializedRepairCandidate[] {
    return candidates.map((candidate) => ({
        aliasId: candidate.alias_id,
        aliasName: candidate.alias_name,
        aliasExternalId: candidate.alias_external_id,
        canonicalId: candidate.canonical_id,
        canonicalName: candidate.canonical_name,
        deletedAt: new Date(candidate.deleted_at).toISOString(),
        referencedRubbers: Number(candidate.referenced_rubbers),
    }));
}

function buildResult(
    target: RepairTarget,
    apply: boolean,
    candidates: RepairCandidate[],
    restoredAliasIds: string[],
): RepairSoftDeletedPlayerAliasesResult {
    const serializedCandidates = serializeCandidates(candidates);
    return {
        mode: apply ? 'apply' : 'preview',
        scope: target === 'all' ? 'all' : 'single',
        canonicalPlayerId: target === 'all' ? null : target,
        candidateCount: serializedCandidates.length,
        canonicalPlayerCount: new Set(serializedCandidates.map((candidate) => candidate.canonicalId)).size,
        referencedRubberLinks: serializedCandidates.reduce(
            (total, candidate) => total + candidate.referencedRubbers,
            0,
        ),
        candidates: serializedCandidates,
        restoredAliasIds,
    };
}

async function assertActiveCanonicalPlayer(
    database: Kysely<Database>,
    canonicalPlayerId: string,
): Promise<void> {
    const canonical = await database
        .selectFrom('external_players')
        .select('id')
        .where('id', '=', canonicalPlayerId)
        .where('canonical_player_id', 'is', null)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!canonical) {
        throw new Error(
            `Canonical player ${canonicalPlayerId} does not exist, is linked to another player, or is soft-deleted`,
        );
    }
}

export async function repairSoftDeletedPlayerAliases(
    database: Kysely<Database>,
    target: RepairTarget,
    apply: boolean,
): Promise<RepairSoftDeletedPlayerAliasesResult> {
    const validatedTarget = RepairTargetSchema.parse(target);
    const canonicalPlayerId = validatedTarget === 'all' ? undefined : validatedTarget;

    if (canonicalPlayerId) {
        await assertActiveCanonicalPlayer(database, canonicalPlayerId);
    }

    if (!apply) {
        const candidates = await candidateQuery(database, canonicalPlayerId).execute() as RepairCandidate[];
        return buildResult(validatedTarget, false, candidates, []);
    }

    const repair = await database.transaction().execute(async (trx) => {
        if (canonicalPlayerId) {
            await assertActiveCanonicalPlayer(trx, canonicalPlayerId);
        }

        const candidates = await candidateQuery(trx, canonicalPlayerId).execute() as RepairCandidate[];
        const restoredAliasIds: string[] = [];
        const batchSize = 250;

        for (let index = 0; index < candidates.length; index += batchSize) {
            const batch = candidates.slice(index, index + batchSize);
            const restored = await trx
                .updateTable('external_players')
                .set({
                    deleted_at: null,
                    updated_at: new Date(),
                })
                .where('deleted_at', 'is not', null)
                .where((eb) => eb.or(batch.map((candidate) => eb.and([
                    eb('id', '=', candidate.alias_id),
                    eb('canonical_player_id', '=', candidate.canonical_id),
                ]))))
                .returning('id')
                .execute();

            restoredAliasIds.push(...restored.map((row) => row.id));
        }

        return { candidates, restoredAliasIds };
    });

    if (repair.restoredAliasIds.length > 0) {
        await refreshApiReadModels(database, (message) => console.log(message));
    }

    const remaining = await candidateQuery(database, canonicalPlayerId).execute();
    if (remaining.length > 0) {
        throw new Error(
            `Alias repair left ${remaining.length} eligible soft-deleted aliases in ${validatedTarget === 'all' ? 'all-player' : validatedTarget} scope`,
        );
    }

    return buildResult(validatedTarget, true, repair.candidates, repair.restoredAliasIds);
}

const options = parseCliOptions(process.argv.slice(2));

try {
    const result = await repairSoftDeletedPlayerAliases(
        db,
        options.target,
        options.apply,
    );
    console.log(`ALIAS_REPAIR_SUMMARY=${JSON.stringify({
        mode: result.mode,
        scope: result.scope,
        canonicalPlayerId: result.canonicalPlayerId,
        candidateCount: result.candidateCount,
        canonicalPlayerCount: result.canonicalPlayerCount,
        referencedRubberLinks: result.referencedRubberLinks,
        restoredAliasCount: result.restoredAliasIds.length,
    })}`);
    console.log(JSON.stringify(result, null, 2));
} finally {
    await db.destroy();
}
