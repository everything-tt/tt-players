import { createHash } from 'node:crypto';

export interface SourcePlayerInput {
    externalId: string | null;
    name: string;
}

export interface SourceLinkedPlayer {
    externalId: string;
    name: string;
    synthetic: boolean;
}

function normalizedPlayerName(name: string): string {
    return name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('en-GB');
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/**
 * Materialize provider-unidentified players without inventing a global person ID.
 *
 * The synthetic identity is intentionally scoped to the canonical competition,
 * then to normalized source name and duplicate ordinal. That makes equivalent
 * replays converge, prevents the same name in unrelated competitions from
 * sharing an external-player identity, and keeps duplicate same-name source
 * rows distinct when the payload contains more than one of them.
 */
export function sourceLinkedPlayers(
    competitionId: string,
    players: readonly SourcePlayerInput[],
): SourceLinkedPlayer[] {
    const nameOccurrences = new Map<string, number>();

    return players.map((player) => {
        if (player.externalId != null && player.externalId !== '') {
            return {
                externalId: player.externalId,
                name: player.name,
                synthetic: false,
            };
        }

        const normalizedName = normalizedPlayerName(player.name);
        const ordinal = nameOccurrences.get(normalizedName) ?? 0;
        nameOccurrences.set(normalizedName, ordinal + 1);
        const scopeHash = digest(competitionId);
        const nameHash = digest(normalizedName);
        return {
            externalId: `synthetic:${scopeHash}:${nameHash}:${ordinal}`,
            name: player.name,
            synthetic: true,
        };
    });
}
