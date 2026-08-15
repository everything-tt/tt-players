import { DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS } from './player-graph-run-config.js';

export interface PlayerGraphMatch {
    rubberId: string;
    playedAt: string;
    homePlayerId: string;
    homePlayerName: string;
    awayPlayerId: string;
    awayPlayerName: string;
    homeGamesWon: number;
    awayGamesWon: number;
    leagueId: string;
    leagueName: string;
    competitionId: string;
    competitionName: string;
    homeTeamName: string | null;
    awayTeamName: string | null;
}

export interface PlayerGraphAnalysisOptions {
    windowStart: string;
    windowEnd: string;
    halfLifeDays?: number;
    minMatchCount?: number;
    minEdgeWeight?: number;
    maxCommunities?: number;
    maxBridgePlayers?: number;
    maxCrossCommunityEdges?: number;
}

export interface WeightedPlayerEdge {
    playerAId: string;
    playerAName: string;
    playerBId: string;
    playerBName: string;
    matchCount: number;
    playerAWins: number;
    playerBWins: number;
    playerAGamesWon: number;
    playerBGamesWon: number;
    weight: number;
    latestMatchAt: string;
    leagues: string[];
    competitions: string[];
}

export interface CommunityMembership {
    playerId: string;
    playerName: string;
    communityId: string;
    weightedDegree: number;
    opponentCount: number;
    participationCoefficient: number;
    bridgeScore: number;
    externalWeightRatio: number;
}

export interface NamedShare {
    name: string;
    count: number;
    share: number;
}

export interface CommunitySummary {
    communityId: string;
    playerCount: number;
    players: string[];
    internalEdgeCount: number;
    internalWeight: number;
    crossCommunityEdgeCount: number;
    dominantLeague: NamedShare | null;
    dominantCompetition: NamedShare | null;
    dominantTeam: NamedShare | null;
}

export interface CrossCommunityEdge {
    communityAId: string;
    communityBId: string;
    edgeCount: number;
    matchCount: number;
    weight: number;
    strongestPlayerPair: string;
}

export interface PlayerGraphReport {
    generatedAt: string;
    methodology: {
        windowStart: string;
        windowEnd: string;
        halfLifeDays: number;
        edgeWeight: 'sum_exp_recency_decay';
        communityDetection: 'weighted_modularity_local_moving';
        notes: string[];
    };
    totals: {
        matchesConsidered: number;
        activePlayers: number;
        weightedEdges: number;
        communities: number;
        modularity: number;
    };
    validationSignals: {
        representativeCommunities: number;
        communitiesSpanningCompetitions: number;
        communitiesSpanningLeagues: number;
        crossCommunityEdges: number;
        recommendation: 'review_required';
        rationale: string[];
    };
    communities: CommunitySummary[];
    bridgePlayers: CommunityMembership[];
    crossCommunityEdges: CrossCommunityEdge[];
    memberships: CommunityMembership[];
    edges: WeightedPlayerEdge[];
}

interface EdgeAccumulator {
    playerAId: string;
    playerAName: string;
    playerBId: string;
    playerBName: string;
    matchCount: number;
    playerAWins: number;
    playerBWins: number;
    playerAGamesWon: number;
    playerBGamesWon: number;
    weight: number;
    latestMatchAt: string;
    leagues: Set<string>;
    competitions: Set<string>;
}

interface Graph {
    nodes: string[];
    adjacency: Map<string, Map<string, number>>;
    degree: Map<string, number>;
    totalEdgeWeight: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_COMMUNITIES = 20;
const DEFAULT_MAX_BRIDGE_PLAYERS = 20;
const DEFAULT_MAX_CROSS_COMMUNITY_EDGES = 20;
const EPSILON = 1e-12;

export function buildWeightedPlayerEdges(
    matches: PlayerGraphMatch[],
    options: PlayerGraphAnalysisOptions,
): WeightedPlayerEdge[] {
    const windowStartMs = parseDateKey(options.windowStart);
    const windowEndMs = parseDateKey(options.windowEnd);
    if (windowStartMs > windowEndMs) {
        throw new Error('windowStart must be on or before windowEnd');
    }

    const halfLifeDays = positiveNumber(
        options.halfLifeDays,
        DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
        'halfLifeDays',
    );
    const minMatchCount = nonNegativeInteger(options.minMatchCount, 1, 'minMatchCount');
    const minEdgeWeight = nonNegativeNumber(options.minEdgeWeight, 0, 'minEdgeWeight');
    const accumulators = new Map<string, EdgeAccumulator>();

    for (const match of matches) {
        if (match.homePlayerId === match.awayPlayerId) continue;
        const playedAtMs = parseDateKey(match.playedAt);
        if (playedAtMs < windowStartMs || playedAtMs > windowEndMs) continue;

        const homeIsA = match.homePlayerId.localeCompare(match.awayPlayerId) < 0;
        const playerAId = homeIsA ? match.homePlayerId : match.awayPlayerId;
        const playerAName = homeIsA ? match.homePlayerName : match.awayPlayerName;
        const playerBId = homeIsA ? match.awayPlayerId : match.homePlayerId;
        const playerBName = homeIsA ? match.awayPlayerName : match.homePlayerName;
        const key = `${playerAId}\u0000${playerBId}`;
        const ageDays = Math.max(0, (windowEndMs - playedAtMs) / DAY_MS);
        const recencyWeight = Math.exp(-Math.log(2) * ageDays / halfLifeDays);

        let edge = accumulators.get(key);
        if (!edge) {
            edge = {
                playerAId,
                playerAName,
                playerBId,
                playerBName,
                matchCount: 0,
                playerAWins: 0,
                playerBWins: 0,
                playerAGamesWon: 0,
                playerBGamesWon: 0,
                weight: 0,
                latestMatchAt: match.playedAt,
                leagues: new Set<string>(),
                competitions: new Set<string>(),
            };
            accumulators.set(key, edge);
        }

        edge.matchCount += 1;
        edge.weight += recencyWeight;
        edge.latestMatchAt = edge.latestMatchAt < match.playedAt ? match.playedAt : edge.latestMatchAt;
        edge.leagues.add(match.leagueName);
        edge.competitions.add(match.competitionName);

        // Equal game scores do not count as a win for either side (incomplete / anomalous rows).
        const homeWon = match.homeGamesWon > match.awayGamesWon;
        const awayWon = match.awayGamesWon > match.homeGamesWon;
        if (homeIsA) {
            edge.playerAGamesWon += match.homeGamesWon;
            edge.playerBGamesWon += match.awayGamesWon;
            if (homeWon) edge.playerAWins += 1;
            if (awayWon) edge.playerBWins += 1;
        } else {
            edge.playerAGamesWon += match.awayGamesWon;
            edge.playerBGamesWon += match.homeGamesWon;
            if (awayWon) edge.playerAWins += 1;
            if (homeWon) edge.playerBWins += 1;
        }
    }

    return [...accumulators.values()]
        .filter((edge) => edge.matchCount >= minMatchCount && edge.weight >= minEdgeWeight)
        .map((edge) => ({
            playerAId: edge.playerAId,
            playerAName: edge.playerAName,
            playerBId: edge.playerBId,
            playerBName: edge.playerBName,
            matchCount: edge.matchCount,
            playerAWins: edge.playerAWins,
            playerBWins: edge.playerBWins,
            playerAGamesWon: edge.playerAGamesWon,
            playerBGamesWon: edge.playerBGamesWon,
            weight: round(edge.weight),
            latestMatchAt: edge.latestMatchAt,
            leagues: [...edge.leagues].sort(),
            competitions: [...edge.competitions].sort(),
        }))
        .sort((left, right) =>
            right.weight - left.weight
            || right.matchCount - left.matchCount
            || left.playerAId.localeCompare(right.playerAId)
            || left.playerBId.localeCompare(right.playerBId)
        );
}

export function detectWeightedCommunities(edges: WeightedPlayerEdge[]): {
    membershipByPlayer: Map<string, string>;
    modularity: number;
} {
    const graph = buildGraph(edges);
    if (graph.nodes.length === 0) {
        return { membershipByPlayer: new Map(), modularity: 0 };
    }

    const partition = localMovingPartition(graph);
    const groups = new Map<string, string[]>();
    for (const node of graph.nodes) {
        const rawCommunity = partition.get(node) ?? node;
        const members = groups.get(rawCommunity) ?? [];
        members.push(node);
        groups.set(rawCommunity, members);
    }

    const orderedGroups = [...groups.values()]
        .map((members) => members.sort())
        .sort((left, right) =>
            right.length - left.length
            || left[0]!.localeCompare(right[0]!)
        );

    const membershipByPlayer = new Map<string, string>();
    orderedGroups.forEach((members, index) => {
        const communityId = `community-${index + 1}`;
        for (const playerId of members) membershipByPlayer.set(playerId, communityId);
    });

    return {
        membershipByPlayer,
        modularity: round(calculateModularity(graph, membershipByPlayer)),
    };
}

export function analysePlayerGraph(
    matches: PlayerGraphMatch[],
    options: PlayerGraphAnalysisOptions,
): PlayerGraphReport {
    const halfLifeDays = positiveNumber(
        options.halfLifeDays,
        DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
        'halfLifeDays',
    );
    const windowMatches = filterMatchesInWindow(matches, options.windowStart, options.windowEnd);
    const edges = buildWeightedPlayerEdges(windowMatches, { ...options, halfLifeDays });
    const { membershipByPlayer, modularity } = detectWeightedCommunities(edges);
    const graph = buildGraph(edges);
    const playerNames = collectPlayerNames(edges);
    const memberships = buildMembershipMetrics(graph, membershipByPlayer, playerNames);
    const communities = buildCommunitySummaries(
        windowMatches,
        edges,
        membershipByPlayer,
        playerNames,
        options.maxCommunities ?? DEFAULT_MAX_COMMUNITIES,
    );
    const bridgePlayers = memberships
        .filter((player) => player.externalWeightRatio > 0)
        .sort((left, right) =>
            right.bridgeScore - left.bridgeScore
            || right.externalWeightRatio - left.externalWeightRatio
            || right.weightedDegree - left.weightedDegree
            || left.playerName.localeCompare(right.playerName)
        )
        .slice(0, options.maxBridgePlayers ?? DEFAULT_MAX_BRIDGE_PLAYERS);
    const crossCommunityEdges = buildCrossCommunityEdges(
        edges,
        membershipByPlayer,
        options.maxCrossCommunityEdges ?? DEFAULT_MAX_CROSS_COMMUNITY_EDGES,
    );

    const representativeCommunities = communities.filter((community) => community.playerCount >= 5);
    const communitiesSpanningCompetitions = representativeCommunities.filter(
        (community) => (community.dominantCompetition?.share ?? 1) < 0.8,
    ).length;
    const communitiesSpanningLeagues = representativeCommunities.filter(
        (community) => (community.dominantLeague?.share ?? 1) < 0.8,
    ).length;

    const rationale = [
        `${representativeCommunities.length} communities have at least five active players.`,
        `${communitiesSpanningCompetitions} representative communities have less than 80% of player-match activity in one competition.`,
        `${communitiesSpanningLeagues} representative communities have less than 80% of player-match activity in one league.`,
        `${crossCommunityEdges.length} strongest cross-community connections are included for manual inspection.`,
        'A human should inspect the representative communities before deciding whether Stage 2 product work is justified.',
    ];

    return {
        generatedAt: new Date().toISOString(),
        methodology: {
            windowStart: options.windowStart,
            windowEnd: options.windowEnd,
            halfLifeDays,
            edgeWeight: 'sum_exp_recency_decay',
            communityDetection: 'weighted_modularity_local_moving',
            notes: [
                'Singles rubbers only should be supplied by the database loader.',
                'Each match contributes exp(-ln(2) * ageDays / halfLifeDays) to its player-pair edge.',
                'Community detection uses deterministic weighted modularity local moving, the core optimization step used by Louvain-style methods.',
                'Bridge score is weighted degree multiplied by the participation coefficient across detected communities.',
                'The report is exploratory and must not be used as an official league, club, or ranking classification.',
            ],
        },
        totals: {
            matchesConsidered: windowMatches.length,
            activePlayers: graph.nodes.length,
            weightedEdges: edges.length,
            communities: new Set(membershipByPlayer.values()).size,
            modularity,
        },
        validationSignals: {
            representativeCommunities: representativeCommunities.length,
            communitiesSpanningCompetitions,
            communitiesSpanningLeagues,
            crossCommunityEdges: edges.filter((edge) =>
                membershipByPlayer.get(edge.playerAId) !== membershipByPlayer.get(edge.playerBId)
            ).length,
            recommendation: 'review_required',
            rationale,
        },
        communities,
        bridgePlayers,
        crossCommunityEdges,
        memberships,
        edges,
    };
}

export function renderPlayerGraphMarkdown(report: PlayerGraphReport): string {
    const lines = [
        '# Player interaction graph — Stage 1 analysis',
        '',
        `Generated: ${report.generatedAt}`,
        `Window: ${report.methodology.windowStart} → ${report.methodology.windowEnd}`,
        `Recency half-life: ${report.methodology.halfLifeDays} days`,
        '',
        '## Summary',
        '',
        `- Matches considered: ${report.totals.matchesConsidered}`,
        `- Active players: ${report.totals.activePlayers}`,
        `- Weighted player edges: ${report.totals.weightedEdges}`,
        `- Detected communities: ${report.totals.communities}`,
        `- Modularity: ${report.totals.modularity.toFixed(4)}`,
        `- Representative communities (5+ players): ${report.validationSignals.representativeCommunities}`,
        `- Representative communities spanning competitions: ${report.validationSignals.communitiesSpanningCompetitions}`,
        `- Representative communities spanning leagues: ${report.validationSignals.communitiesSpanningLeagues}`,
        `- Cross-community edges: ${report.validationSignals.crossCommunityEdges}`,
        '',
        '## Validation decision',
        '',
        '**REVIEW REQUIRED before Stage 2.** This report deliberately does not make an automatic go/no-go product decision.',
        '',
        ...report.validationSignals.rationale.map((item) => `- ${item}`),
        '',
        '## Largest / representative communities',
        '',
        '| Community | Players | Dominant league | Dominant competition | Dominant team | Internal weight | Cross edges |',
        '|---|---:|---|---|---|---:|---:|',
        ...report.communities.map((community) =>
            `| ${escapeTable(community.communityId)} | ${community.playerCount} | ${formatShare(community.dominantLeague)} | ${formatShare(community.dominantCompetition)} | ${formatShare(community.dominantTeam)} | ${community.internalWeight.toFixed(2)} | ${community.crossCommunityEdgeCount} |`
        ),
        '',
        '## Bridge / connector players',
        '',
        '| Player | Community | Opponents | Weighted degree | Outside share | Participation | Bridge score |',
        '|---|---|---:|---:|---:|---:|---:|',
        ...report.bridgePlayers.map((player) =>
            `| ${escapeTable(player.playerName)} | ${player.communityId} | ${player.opponentCount} | ${player.weightedDegree.toFixed(2)} | ${(player.externalWeightRatio * 100).toFixed(1)}% | ${player.participationCoefficient.toFixed(3)} | ${player.bridgeScore.toFixed(2)} |`
        ),
        '',
        '## Strongest cross-community edges',
        '',
        '| Communities | Pair | Matches | Weight |',
        '|---|---|---:|---:|',
        ...report.crossCommunityEdges.map((edge) =>
            `| ${edge.communityAId} ↔ ${edge.communityBId} | ${escapeTable(edge.strongestPlayerPair)} | ${edge.matchCount} | ${edge.weight.toFixed(2)} |`
        ),
        '',
        '## What to inspect manually',
        '',
        '1. Do the largest communities merely reproduce one league/division/team, or do they reveal credible overlapping playing pools?',
        '2. Are the bridge players genuinely active across otherwise separate groups?',
        '3. Are cross-community edges caused by real tournaments/cross-league play rather than identity or ingestion errors?',
        '4. If the structure is non-trivial and credible, record a go decision for Stage 2; otherwise stop or revisit weighting/window choices.',
        '',
    ];

    return `${lines.join('\n')}\n`;
}

function buildGraph(edges: WeightedPlayerEdge[]): Graph {
    const adjacency = new Map<string, Map<string, number>>();
    const degree = new Map<string, number>();
    let totalEdgeWeight = 0;

    for (const edge of edges) {
        if (!(edge.weight > 0)) continue;
        addNeighbour(adjacency, edge.playerAId, edge.playerBId, edge.weight);
        addNeighbour(adjacency, edge.playerBId, edge.playerAId, edge.weight);
        degree.set(edge.playerAId, (degree.get(edge.playerAId) ?? 0) + edge.weight);
        degree.set(edge.playerBId, (degree.get(edge.playerBId) ?? 0) + edge.weight);
        totalEdgeWeight += edge.weight;
    }

    return {
        nodes: [...adjacency.keys()].sort(),
        adjacency,
        degree,
        totalEdgeWeight,
    };
}

function localMovingPartition(graph: Graph): Map<string, string> {
    const membership = new Map(graph.nodes.map((node) => [node, node]));
    const communityDegree = new Map(graph.nodes.map((node) => [node, graph.degree.get(node) ?? 0]));
    const doubledWeight = 2 * graph.totalEdgeWeight;
    if (doubledWeight <= 0) return membership;

    for (let pass = 0; pass < 100; pass += 1) {
        let moved = false;

        for (const node of graph.nodes) {
            const nodeDegree = graph.degree.get(node) ?? 0;
            const currentCommunity = membership.get(node)!;
            communityDegree.set(
                currentCommunity,
                (communityDegree.get(currentCommunity) ?? 0) - nodeDegree,
            );

            const weightByCommunity = new Map<string, number>();
            for (const [neighbour, weight] of graph.adjacency.get(node) ?? []) {
                const community = membership.get(neighbour)!;
                weightByCommunity.set(
                    community,
                    (weightByCommunity.get(community) ?? 0) + weight,
                );
            }

            let bestCommunity = currentCommunity;
            let bestGain = modularityInsertionGain(
                weightByCommunity.get(currentCommunity) ?? 0,
                communityDegree.get(currentCommunity) ?? 0,
                nodeDegree,
                doubledWeight,
            );

            for (const community of [...weightByCommunity.keys()].sort()) {
                const gain = modularityInsertionGain(
                    weightByCommunity.get(community) ?? 0,
                    communityDegree.get(community) ?? 0,
                    nodeDegree,
                    doubledWeight,
                );
                if (
                    gain > bestGain + EPSILON
                    || (Math.abs(gain - bestGain) <= EPSILON && community.localeCompare(bestCommunity) < 0)
                ) {
                    bestGain = gain;
                    bestCommunity = community;
                }
            }

            membership.set(node, bestCommunity);
            communityDegree.set(
                bestCommunity,
                (communityDegree.get(bestCommunity) ?? 0) + nodeDegree,
            );
            if (bestCommunity !== currentCommunity) moved = true;
        }

        if (!moved) break;
    }

    return membership;
}

function modularityInsertionGain(
    weightIntoCommunity: number,
    communityDegree: number,
    nodeDegree: number,
    doubledWeight: number,
): number {
    return weightIntoCommunity - (communityDegree * nodeDegree / doubledWeight);
}

function calculateModularity(graph: Graph, membershipByPlayer: Map<string, string>): number {
    if (graph.totalEdgeWeight <= 0) return 0;

    const internalWeight = new Map<string, number>();
    const totalDegree = new Map<string, number>();
    for (const node of graph.nodes) {
        const community = membershipByPlayer.get(node);
        if (!community) continue;
        totalDegree.set(community, (totalDegree.get(community) ?? 0) + (graph.degree.get(node) ?? 0));
    }

    const visited = new Set<string>();
    for (const node of graph.nodes) {
        for (const [neighbour, weight] of graph.adjacency.get(node) ?? []) {
            const key = node < neighbour ? `${node}\u0000${neighbour}` : `${neighbour}\u0000${node}`;
            if (visited.has(key)) continue;
            visited.add(key);
            const community = membershipByPlayer.get(node);
            if (community && community === membershipByPlayer.get(neighbour)) {
                internalWeight.set(community, (internalWeight.get(community) ?? 0) + weight);
            }
        }
    }

    let modularity = 0;
    const doubledWeight = 2 * graph.totalEdgeWeight;
    for (const [community, degree] of totalDegree) {
        modularity += (internalWeight.get(community) ?? 0) / graph.totalEdgeWeight
            - Math.pow(degree / doubledWeight, 2);
    }
    return modularity;
}

function buildMembershipMetrics(
    graph: Graph,
    membershipByPlayer: Map<string, string>,
    playerNames: Map<string, string>,
): CommunityMembership[] {
    const result: CommunityMembership[] = [];

    for (const playerId of graph.nodes) {
        const communityId = membershipByPlayer.get(playerId)!;
        const byCommunity = new Map<string, number>();
        let weightedDegree = 0;
        for (const [neighbour, weight] of graph.adjacency.get(playerId) ?? []) {
            const neighbourCommunity = membershipByPlayer.get(neighbour)!;
            byCommunity.set(neighbourCommunity, (byCommunity.get(neighbourCommunity) ?? 0) + weight);
            weightedDegree += weight;
        }

        const participationCoefficient = weightedDegree > 0
            ? 1 - [...byCommunity.values()].reduce(
                (sum, weight) => sum + Math.pow(weight / weightedDegree, 2),
                0,
            )
            : 0;
        const internalWeight = byCommunity.get(communityId) ?? 0;
        const externalWeightRatio = weightedDegree > 0
            ? Math.max(0, (weightedDegree - internalWeight) / weightedDegree)
            : 0;

        result.push({
            playerId,
            playerName: playerNames.get(playerId) ?? playerId,
            communityId,
            weightedDegree: round(weightedDegree),
            opponentCount: graph.adjacency.get(playerId)?.size ?? 0,
            participationCoefficient: round(participationCoefficient),
            bridgeScore: round(weightedDegree * participationCoefficient),
            externalWeightRatio: round(externalWeightRatio),
        });
    }

    return result.sort((left, right) =>
        left.communityId.localeCompare(right.communityId)
        || right.weightedDegree - left.weightedDegree
        || left.playerName.localeCompare(right.playerName)
    );
}

function buildCommunitySummaries(
    matches: PlayerGraphMatch[],
    edges: WeightedPlayerEdge[],
    membershipByPlayer: Map<string, string>,
    playerNames: Map<string, string>,
    maxCommunities: number,
): CommunitySummary[] {
    const members = new Map<string, Set<string>>();
    for (const [playerId, communityId] of membershipByPlayer) {
        const set = members.get(communityId) ?? new Set<string>();
        set.add(playerId);
        members.set(communityId, set);
    }

    const internalEdgeCount = new Map<string, number>();
    const internalWeight = new Map<string, number>();
    const crossEdgeCount = new Map<string, number>();
    for (const edge of edges) {
        const a = membershipByPlayer.get(edge.playerAId);
        const b = membershipByPlayer.get(edge.playerBId);
        if (!a || !b) continue;
        if (a === b) {
            internalEdgeCount.set(a, (internalEdgeCount.get(a) ?? 0) + 1);
            internalWeight.set(a, (internalWeight.get(a) ?? 0) + edge.weight);
        } else {
            crossEdgeCount.set(a, (crossEdgeCount.get(a) ?? 0) + 1);
            crossEdgeCount.set(b, (crossEdgeCount.get(b) ?? 0) + 1);
        }
    }

    const leagueCounts = new Map<string, Map<string, number>>();
    const competitionCounts = new Map<string, Map<string, number>>();
    const teamCounts = new Map<string, Map<string, number>>();
    for (const match of matches) {
        addPlayerMetadata(
            membershipByPlayer.get(match.homePlayerId),
            match.leagueName,
            match.competitionName,
            match.homeTeamName,
            leagueCounts,
            competitionCounts,
            teamCounts,
        );
        addPlayerMetadata(
            membershipByPlayer.get(match.awayPlayerId),
            match.leagueName,
            match.competitionName,
            match.awayTeamName,
            leagueCounts,
            competitionCounts,
            teamCounts,
        );
    }

    return [...members.entries()]
        .map(([communityId, playerIds]) => ({
            communityId,
            playerCount: playerIds.size,
            players: [...playerIds]
                .map((playerId) => playerNames.get(playerId) ?? playerId)
                .sort()
                .slice(0, 20),
            internalEdgeCount: internalEdgeCount.get(communityId) ?? 0,
            internalWeight: round(internalWeight.get(communityId) ?? 0),
            crossCommunityEdgeCount: crossEdgeCount.get(communityId) ?? 0,
            dominantLeague: dominantShare(leagueCounts.get(communityId)),
            dominantCompetition: dominantShare(competitionCounts.get(communityId)),
            dominantTeam: dominantShare(teamCounts.get(communityId)),
        }))
        .sort((left, right) =>
            right.playerCount - left.playerCount
            || right.internalWeight - left.internalWeight
            || left.communityId.localeCompare(right.communityId)
        )
        .slice(0, Math.max(1, maxCommunities));
}

function buildCrossCommunityEdges(
    edges: WeightedPlayerEdge[],
    membershipByPlayer: Map<string, string>,
    limit: number,
): CrossCommunityEdge[] {
    const grouped = new Map<string, CrossCommunityEdge>();

    for (const edge of edges) {
        const a = membershipByPlayer.get(edge.playerAId);
        const b = membershipByPlayer.get(edge.playerBId);
        if (!a || !b || a === b) continue;

        const [communityAId, communityBId] = a < b ? [a, b] : [b, a];
        const key = `${communityAId}\u0000${communityBId}`;
        const pair = `${edge.playerAName} ↔ ${edge.playerBName}`;
        const current = grouped.get(key);
        if (!current) {
            grouped.set(key, {
                communityAId,
                communityBId,
                edgeCount: 1,
                matchCount: edge.matchCount,
                weight: edge.weight,
                strongestPlayerPair: pair,
            });
            continue;
        }

        current.edgeCount += 1;
        current.matchCount += edge.matchCount;
        if (edge.weight > current.weight) current.strongestPlayerPair = pair;
        current.weight += edge.weight;
    }

    return [...grouped.values()]
        .map((edge) => ({ ...edge, weight: round(edge.weight) }))
        .sort((left, right) =>
            right.weight - left.weight
            || right.matchCount - left.matchCount
            || left.communityAId.localeCompare(right.communityAId)
            || left.communityBId.localeCompare(right.communityBId)
        )
        .slice(0, Math.max(1, limit));
}

function addPlayerMetadata(
    communityId: string | undefined,
    leagueName: string,
    competitionName: string,
    teamName: string | null,
    leagueCounts: Map<string, Map<string, number>>,
    competitionCounts: Map<string, Map<string, number>>,
    teamCounts: Map<string, Map<string, number>>,
): void {
    if (!communityId) return;
    incrementNested(leagueCounts, communityId, leagueName);
    incrementNested(competitionCounts, communityId, competitionName);
    if (teamName) incrementNested(teamCounts, communityId, teamName);
}

function incrementNested(
    outer: Map<string, Map<string, number>>,
    outerKey: string,
    innerKey: string,
): void {
    const inner = outer.get(outerKey) ?? new Map<string, number>();
    inner.set(innerKey, (inner.get(innerKey) ?? 0) + 1);
    outer.set(outerKey, inner);
}

function dominantShare(counts: Map<string, number> | undefined): NamedShare | null {
    if (!counts || counts.size === 0) return null;
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const [name, count] = [...counts.entries()].sort((left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0])
    )[0]!;
    return { name, count, share: round(count / total) };
}

function collectPlayerNames(edges: WeightedPlayerEdge[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const edge of edges) {
        names.set(edge.playerAId, edge.playerAName);
        names.set(edge.playerBId, edge.playerBName);
    }
    return names;
}

function addNeighbour(
    adjacency: Map<string, Map<string, number>>,
    playerId: string,
    neighbourId: string,
    weight: number,
): void {
    const neighbours = adjacency.get(playerId) ?? new Map<string, number>();
    neighbours.set(neighbourId, (neighbours.get(neighbourId) ?? 0) + weight);
    adjacency.set(playerId, neighbours);
}

function filterMatchesInWindow(
    matches: PlayerGraphMatch[],
    start: string,
    end: string,
): PlayerGraphMatch[] {
    const startMs = parseDateKey(start);
    const endMs = parseDateKey(end);
    return matches.filter((match) => {
        const playedAt = parseDateKey(match.playedAt);
        return playedAt >= startMs && playedAt <= endMs;
    });
}

function parseDateKey(value: string): number {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T00:00:00.000Z`
        : value;
    const parsed = Date.parse(normalized);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid date: ${value}`);
    return parsed;
}

function positiveNumber(value: number | undefined, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved <= 0) {
        throw new Error(`${name} must be greater than zero`);
    }
    return resolved;
}

function nonNegativeNumber(value: number | undefined, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved < 0) {
        throw new Error(`${name} must be zero or greater`);
    }
    return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return resolved;
}

function formatShare(value: NamedShare | null): string {
    if (!value) return '—';
    return `${escapeTable(value.name)} (${(value.share * 100).toFixed(0)}%)`;
}

function escapeTable(value: string): string {
    return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function round(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}
