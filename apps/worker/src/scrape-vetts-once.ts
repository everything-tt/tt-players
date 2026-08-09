import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { discoverVettsTournaments } from './vetts-discovery.js';
import { vettsDiscoveryYears } from './vetts-client.js';
import { syncVettsTournament } from './vetts-sync.js';

dotenv.config();

const TOURNAMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function discoveryLimit(): number | null {
    const raw = (process.env['VETTS_DISCOVERY_LIMIT'] ?? '30').trim().toLowerCase();
    if (raw === 'all') return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : 30;
}

function suppliedTournamentIds(): string[] {
    const ids = [...new Set(
        process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean),
    )];
    for (const tournamentId of ids) {
        if (!TOURNAMENT_ID_PATTERN.test(tournamentId)) {
            throw new Error(`Invalid VETTS tournament UUID: ${tournamentId}`);
        }
    }
    return ids;
}

async function discoverTournamentIds(): Promise<string[]> {
    const allHistory = (process.env['VETTS_DISCOVERY_YEARS'] ?? '').trim().toLowerCase() === 'all';
    const years = vettsDiscoveryYears();
    const discovery = await discoverVettsTournaments(
        db,
        {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
        },
        years,
        { allowEmptyYears: allHistory },
    );
    const limit = discoveryLimit();
    const tournaments = limit === null
        ? discovery.tournaments
        : discovery.tournaments.slice(0, limit);
    const ids = tournaments.map((tournament) => tournament.tournamentId);

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
