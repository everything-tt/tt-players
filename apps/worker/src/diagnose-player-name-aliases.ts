import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { sql } from 'kysely';
import { z } from 'zod';

dotenv.config();

function optionValue(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
}

const playerName = z.string().trim().min(1).parse(
    optionValue(process.argv.slice(2), '--player-name'),
);
const namePattern = `%${playerName.split(/\s+/).join('%')}%`;

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

async function loadCanonicalChain(requestedId: string) {
    const nodes: Array<LoadedPlayer & { depth: number }> = [];
    const seen = new Set<string>();
    let currentId: string | null = requestedId;

    for (let depth = 0; currentId && depth < 12; depth += 1) {
        if (seen.has(currentId)) {
            return { nodes, rootId: null, cycleAtId: currentId, missingId: null };
        }
        seen.add(currentId);

        const player = await loadPlayer(currentId);
        if (!player) {
            return { nodes, rootId: null, cycleAtId: null, missingId: currentId };
        }

        nodes.push({ ...player, depth });
        if (!player.canonical_player_id || player.canonical_player_id === player.id) {
            return { nodes, rootId: player.id, cycleAtId: null, missingId: null };
        }
        currentId = player.canonical_player_id;
    }

    return { nodes, rootId: null, cycleAtId: null, missingId: null };
}

async function loadRubberReferences(playerId: string) {
    return db
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
            'r.deleted_at',
            'f.date_played',
            'f.deleted_at as fixture_deleted_at',
        ])
        .where((eb) => eb.or([
            eb('r.home_player_1_id', '=', playerId),
            eb('r.home_player_2_id', '=', playerId),
            eb('r.away_player_1_id', '=', playerId),
            eb('r.away_player_2_id', '=', playerId),
        ]))
        .orderBy('f.date_played', 'desc')
        .orderBy('r.id', 'asc')
        .execute();
}

try {
    const matchingPlayers = await db
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
        .where(sql<boolean>`ep.name ILIKE ${namePattern}`)
        .orderBy('ep.name', 'asc')
        .orderBy('ep.deleted_at', 'asc')
        .orderBy('ep.id', 'asc')
        .execute();

    const rows = await Promise.all(matchingPlayers.map(async (player) => {
        const [chain, references] = await Promise.all([
            loadCanonicalChain(player.id),
            loadRubberReferences(player.id),
        ]);
        const immediateCanonicalId = player.canonical_player_id ?? player.id;
        const immediateCanonical = immediateCanonicalId === player.id
            ? player
            : await loadPlayer(immediateCanonicalId);
        const activeRubbers = references.filter((rubber) => rubber.deleted_at === null);
        const activeFixtureRubbers = activeRubbers.filter(
            (rubber) => rubber.fixture_deleted_at === null,
        );

        const checks = {
            isAlias: player.id !== immediateCanonicalId,
            aliasSoftDeleted: player.deleted_at !== null,
            canonicalExists: immediateCanonical !== undefined,
            canonicalActive: immediateCanonical?.deleted_at === null,
            canonicalIsRoot: immediateCanonical !== undefined && (
                immediateCanonical.canonical_player_id === null ||
                immediateCanonical.canonical_player_id === immediateCanonical.id
            ),
            referencedByActiveRubber: activeRubbers.length > 0,
        };
        const eligibleForCurrentRepair = Object.values(checks).every(Boolean);
        const exclusionReasons = Object.entries(checks)
            .filter(([, passes]) => !passes)
            .map(([check]) => check);

        const canonicalGroup = chain.rootId
            ? await db
                .selectFrom('external_players as ep')
                .leftJoin('platforms as p', 'p.id', 'ep.platform_id')
                .select([
                    'ep.id',
                    'ep.name',
                    'ep.external_id',
                    'p.name as platform_name',
                    'ep.canonical_player_id',
                    'ep.deleted_at',
                ])
                .where(sql<boolean>`COALESCE(ep.canonical_player_id, ep.id) = ${chain.rootId}::uuid`)
                .orderBy('ep.deleted_at', 'asc')
                .orderBy('ep.id', 'asc')
                .execute()
            : [];

        return {
            player,
            chain,
            immediateCanonical,
            checks,
            eligibleForCurrentRepair,
            exclusionReasons,
            referenceCounts: {
                total: references.length,
                activeRubbers: activeRubbers.length,
                activeFixtureRubbers: activeFixtureRubbers.length,
            },
            references,
            canonicalGroup,
        };
    }));

    const summary = {
        playerName,
        namePattern,
        matchingRowCount: rows.length,
        eligibleRowCount: rows.filter((row) => row.eligibleForCurrentRepair).length,
        rows: rows.map((row) => ({
            id: row.player.id,
            name: row.player.name,
            platform: row.player.platform_name,
            externalId: row.player.external_id,
            deleted: row.player.deleted_at !== null,
            canonicalPlayerId: row.player.canonical_player_id,
            rootId: row.chain.rootId,
            eligibleForCurrentRepair: row.eligibleForCurrentRepair,
            exclusionReasons: row.exclusionReasons,
            referenceCounts: row.referenceCounts,
        })),
    };

    console.log(`PLAYER_NAME_DIAGNOSTIC_SUMMARY=${JSON.stringify(summary)}`);
    console.log(JSON.stringify({ ...summary, details: rows }, null, 2));
} finally {
    await db.destroy();
}
