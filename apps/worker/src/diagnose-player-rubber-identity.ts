import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { sql } from 'kysely';
import { z } from 'zod';

dotenv.config();

const UuidSchema = z.string().uuid();

function optionValue(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
}

const argv = process.argv.slice(2);
const rubberId = UuidSchema.parse(optionValue(argv, '--rubber-id'));
const expectedPlayerIds = z.array(UuidSchema).max(10).parse(
    (optionValue(argv, '--expected-player-ids') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
);

async function loadPlayer(playerId: string) {
    return db
        .selectFrom('external_players as ep')
        .leftJoin('platforms as p', 'p.id', 'ep.platform_id')
        .select([
            'ep.id',
            'ep.name',
            'ep.external_id',
            'ep.platform_id',
            'p.name as platform_name',
            'ep.canonical_player_id',
            'ep.deleted_at',
            'ep.created_at',
            'ep.updated_at',
        ])
        .where('ep.id', '=', playerId)
        .executeTakeFirst();
}

type LoadedPlayer = NonNullable<Awaited<ReturnType<typeof loadPlayer>>>;

type ChainResult = {
    requestedId: string;
    nodes: Array<LoadedPlayer & { depth: number }>;
    rootId: string | null;
    missingId: string | null;
    cycleAtId: string | null;
    depthLimitReached: boolean;
};

async function loadCanonicalChain(requestedId: string): Promise<ChainResult> {
    const nodes: ChainResult['nodes'] = [];
    const seen = new Set<string>();
    let currentId: string | null = requestedId;

    for (let depth = 0; currentId && depth < 12; depth += 1) {
        if (seen.has(currentId)) {
            return {
                requestedId,
                nodes,
                rootId: null,
                missingId: null,
                cycleAtId: currentId,
                depthLimitReached: false,
            };
        }
        seen.add(currentId);

        const player = await loadPlayer(currentId);
        if (!player) {
            return {
                requestedId,
                nodes,
                rootId: null,
                missingId: currentId,
                cycleAtId: null,
                depthLimitReached: false,
            };
        }

        nodes.push({ ...player, depth });
        if (!player.canonical_player_id || player.canonical_player_id === player.id) {
            return {
                requestedId,
                nodes,
                rootId: player.id,
                missingId: null,
                cycleAtId: null,
                depthLimitReached: false,
            };
        }

        currentId = player.canonical_player_id;
    }

    return {
        requestedId,
        nodes,
        rootId: null,
        missingId: null,
        cycleAtId: null,
        depthLimitReached: true,
    };
}

async function resolveLikePlayersApi(requestedId: string) {
    const requested = await loadPlayer(requestedId);
    if (!requested || requested.deleted_at) {
        return {
            requestedId,
            resolves: false,
            reason: !requested ? 'requested-row-missing' : 'requested-row-soft-deleted',
            canonicalId: requested?.canonical_player_id ?? requested?.id ?? null,
            sourceIds: [] as string[],
        };
    }

    const canonicalId = requested.canonical_player_id ?? requested.id;
    const sourceRows = await db
        .selectFrom('external_players')
        .select(['id', 'name', 'canonical_player_id', 'deleted_at'])
        .where('deleted_at', 'is', null)
        .where(sql<boolean>`COALESCE(canonical_player_id, id) = ${canonicalId}::uuid`)
        .orderBy('id')
        .execute();

    return {
        requestedId,
        resolves: sourceRows.length > 0,
        reason: sourceRows.length > 0 ? null : 'no-active-source-rows',
        canonicalId,
        sourceIds: sourceRows.map((row) => row.id),
        sourceRows,
    };
}

try {
    const rubber = await db
        .selectFrom('rubbers as r')
        .leftJoin('fixtures as f', 'f.id', 'r.fixture_id')
        .select([
            'r.id',
            'r.external_id',
            'r.fixture_id',
            'r.home_player_1_id',
            'r.home_player_2_id',
            'r.away_player_1_id',
            'r.away_player_2_id',
            'r.home_games_won',
            'r.away_games_won',
            'r.is_doubles',
            'r.outcome_type',
            'r.deleted_at',
            'r.created_at',
            'r.updated_at',
            'f.date_played',
            'f.deleted_at as fixture_deleted_at',
        ])
        .where('r.id', '=', rubberId)
        .executeTakeFirst();

    if (!rubber) {
        throw new Error(`Rubber ${rubberId} does not exist`);
    }

    const participantRoles = [
        { role: 'home_player_1', id: rubber.home_player_1_id },
        { role: 'home_player_2', id: rubber.home_player_2_id },
        { role: 'away_player_1', id: rubber.away_player_1_id },
        { role: 'away_player_2', id: rubber.away_player_2_id },
    ];
    const participantIds = Array.from(new Set(
        participantRoles.flatMap((participant) => participant.id ? [participant.id] : []),
    ));

    const participantChains = await Promise.all(
        participantRoles.map(async (participant) => ({
            role: participant.role,
            id: participant.id,
            chain: participant.id ? await loadCanonicalChain(participant.id) : null,
        })),
    );

    const expectedPlayers = await Promise.all(
        expectedPlayerIds.map(async (expectedPlayerId) => {
            const [chain, resolver] = await Promise.all([
                loadCanonicalChain(expectedPlayerId),
                resolveLikePlayersApi(expectedPlayerId),
            ]);
            const matchingRubberParticipantIds = participantIds.filter((participantId) =>
                resolver.sourceIds.includes(participantId),
            );

            return {
                expectedPlayerId,
                chain,
                resolver,
                matchingRubberParticipantIds,
                representedInRubber: matchingRubberParticipantIds.length > 0,
            };
        }),
    );

    const result = {
        rubber,
        participantRoles,
        participantChains,
        expectedPlayers,
    };

    console.log(`IDENTITY_DIAGNOSTIC_SUMMARY=${JSON.stringify({
        rubberId,
        rubberDeleted: rubber.deleted_at !== null,
        fixtureDeleted: rubber.fixture_deleted_at !== null,
        participantIds,
        expectedPlayers: expectedPlayers.map((player) => ({
            expectedPlayerId: player.expectedPlayerId,
            resolves: player.resolver.resolves,
            canonicalId: player.resolver.canonicalId,
            sourceIds: player.resolver.sourceIds,
            matchingRubberParticipantIds: player.matchingRubberParticipantIds,
            representedInRubber: player.representedInRubber,
        })),
    })}`);
    console.log(JSON.stringify(result, null, 2));
} finally {
    await db.destroy();
}
