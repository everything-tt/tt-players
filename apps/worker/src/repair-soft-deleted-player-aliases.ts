import dotenv from 'dotenv';
import { db, type Database } from '@tt-players/db';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { refreshApiReadModels } from './read-models.js';

dotenv.config();

const CliOptionsSchema = z.object({
    canonicalPlayerId: z.string().uuid(),
    apply: z.boolean(),
});

interface RepairCandidate {
    alias_id: string;
    alias_name: string;
    alias_external_id: string | null;
    canonical_id: string;
    canonical_name: string;
    deleted_at: Date | string;
    referenced_rubbers: number | string;
}

export interface RepairSoftDeletedPlayerAliasesResult {
    mode: 'preview' | 'apply';
    canonicalPlayerId: string;
    candidates: Array<{
        aliasId: string;
        aliasName: string;
        aliasExternalId: string | null;
        canonicalId: string;
        canonicalName: string;
        deletedAt: string;
        referencedRubbers: number;
    }>;
    restoredAliasIds: string[];
}

function parseCliOptions(argv: string[]) {
    const canonicalIndex = argv.indexOf('--canonical-player-id');
    const canonicalPlayerId = canonicalIndex >= 0 ? argv[canonicalIndex + 1] : undefined;

    return CliOptionsSchema.parse({
        canonicalPlayerId,
        apply: argv.includes('--apply'),
    });
}

function candidateQuery(database: Kysely<Database>, canonicalPlayerId: string) {
    return database
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
        .where('alias.canonical_player_id', '=', canonicalPlayerId)
        .where('alias.id', '!=', canonicalPlayerId)
        .where('alias.deleted_at', 'is not', null)
        .where('canonical.deleted_at', 'is', null)
        .groupBy([
            'alias.id',
            'alias.name',
            'alias.external_id',
            'canonical.id',
            'canonical.name',
            'alias.deleted_at',
        ])
        .orderBy('referenced_rubbers', 'desc')
        .orderBy('alias.id', 'asc');
}

function serializeCandidates(candidates: RepairCandidate[]) {
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

async function assertActiveCanonicalPlayer(
    database: Kysely<Database>,
    canonicalPlayerId: string,
): Promise<void> {
    const canonical = await database
        .selectFrom('external_players')
        .select('id')
        .where('id', '=', canonicalPlayerId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

    if (!canonical) {
        throw new Error(`Canonical player ${canonicalPlayerId} does not exist or is soft-deleted`);
    }
}

export async function repairSoftDeletedPlayerAliases(
    database: Kysely<Database>,
    canonicalPlayerId: string,
    apply: boolean,
): Promise<RepairSoftDeletedPlayerAliasesResult> {
    const validatedCanonicalPlayerId = z.string().uuid().parse(canonicalPlayerId);
    await assertActiveCanonicalPlayer(database, validatedCanonicalPlayerId);

    if (!apply) {
        const candidates = await candidateQuery(database, validatedCanonicalPlayerId).execute() as RepairCandidate[];
        return {
            mode: 'preview',
            canonicalPlayerId: validatedCanonicalPlayerId,
            candidates: serializeCandidates(candidates),
            restoredAliasIds: [],
        };
    }

    const repair = await database.transaction().execute(async (trx) => {
        await assertActiveCanonicalPlayer(trx, validatedCanonicalPlayerId);
        const candidates = await candidateQuery(trx, validatedCanonicalPlayerId).execute() as RepairCandidate[];
        const candidateIds = candidates.map((candidate) => candidate.alias_id);

        if (candidateIds.length === 0) {
            return { candidates, restoredAliasIds: [] as string[] };
        }

        const restored = await trx
            .updateTable('external_players')
            .set({
                deleted_at: null,
                updated_at: new Date(),
            })
            .where('id', 'in', candidateIds)
            .where('canonical_player_id', '=', validatedCanonicalPlayerId)
            .where('deleted_at', 'is not', null)
            .returning('id')
            .execute();

        return {
            candidates,
            restoredAliasIds: restored.map((row) => row.id),
        };
    });

    if (repair.restoredAliasIds.length > 0) {
        await refreshApiReadModels(database, (message) => console.log(message));
    }

    const remaining = await candidateQuery(database, validatedCanonicalPlayerId).execute();
    if (remaining.length > 0) {
        throw new Error(
            `Alias repair left ${remaining.length} eligible soft-deleted aliases for ${validatedCanonicalPlayerId}`,
        );
    }

    return {
        mode: 'apply',
        canonicalPlayerId: validatedCanonicalPlayerId,
        candidates: serializeCandidates(repair.candidates),
        restoredAliasIds: repair.restoredAliasIds,
    };
}

const options = parseCliOptions(process.argv.slice(2));

try {
    const result = await repairSoftDeletedPlayerAliases(
        db,
        options.canonicalPlayerId,
        options.apply,
    );
    console.log(JSON.stringify(result, null, 2));
} finally {
    await db.destroy();
}
