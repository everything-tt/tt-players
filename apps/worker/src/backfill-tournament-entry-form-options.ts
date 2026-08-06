export interface TournamentEntryFormBackfillOptions {
    limit: number;
    force: boolean;
}

function numericOption(args: string[], name: string, fallback: number): number {
    const prefix = `--${name}=`;
    const raw = args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
    const value = Number(raw ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 5_000) {
        throw new Error(`${name} must be an integer between 1 and 5000`);
    }
    return value;
}

export function parseTournamentEntryFormBackfillOptions(
    args: string[] = process.argv.slice(2),
): TournamentEntryFormBackfillOptions {
    return {
        limit: numericOption(args, 'limit', 500),
        force: args.includes('--force'),
    };
}
