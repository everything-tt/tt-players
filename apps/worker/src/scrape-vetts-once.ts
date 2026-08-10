import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { discoverVettsTournaments } from './vetts-discovery.js';
import { syncVettsTournament } from './vetts-sync.js';

dotenv.config();

const TOURNAMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function discoveryLimit(): number {
    const value = Number(process.env['VETTS_DISCOVERY_LIMIT'] ?? 30);
    return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 30;
}

function suppliedTournamentIds(): string[] {
    const argumentsToParse = [...process.argv.slice(2)];
    if (argumentsToParse[0] === '--') argumentsToParse.shift();
    const ids = [...new Set(
        argumentsToParse.map((value) => value.trim().toLowerCase()).filter(Boolean),
    )];
    for (const tournamentId of ids) {
        if (!TOURNAMENT_ID_PATTERN.test(tournamentId)) {
            throw new Error(`Invalid VETTS tournament UUID: ${tournamentId}`);
        }
    }
    return ids;
}

async function discoverTournamentIds(): Promise<string[]> {
    const discovery = await discoverVettsTournaments(db, {
        info: (message) => console.log(message),
        warn: (message) => console.warn(message),
    });
    const ids = discovery.tournaments
        .slice(0, discoveryLimit())
        .map((tournament) => tournament.tournamentId);

    if (ids.length === 0) {
        throw new AggregateError(discovery.failures, 'No usable VETTS tournaments discovered');
    }
    if (discovery.failures.length > 0) {
        console.warn(new AggregateError(discovery.failures, 'Some VETTS calendar pages failed'));
    }
    return ids;
}

async function main(): Promise<void> {
    const suppliedIds = suppliedTournamentIds();
    const tournamentIds = suppliedIds.length > 0 ? suppliedIds : await discoverTournamentIds();

    for (const tournamentId of tournamentIds) {
        const result = await syncVettsTournament(db, tournamentId, {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
        });
        console.log(JSON.stringify(result));
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
