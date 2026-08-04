import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { fetchVettsDiscovery, vettsDiscoveryYears, vettsUrls } from './vetts-client.js';
import { parseVettsTournamentLinks } from './vetts-parser.js';
import { syncVettsTournament } from './vetts-sync.js';

dotenv.config();

const TOURNAMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function discoveryLimit(): number {
    const value = Number(process.env['VETTS_DISCOVERY_LIMIT'] ?? 30);
    return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 30;
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
    const tournaments = new Map<string, string>();
    const failures: Error[] = [];

    for (const year of vettsDiscoveryYears()) {
        const discoveryUrl = vettsUrls.discovery(year);
        try {
            const links = parseVettsTournamentLinks(
                await fetchVettsDiscovery(year),
                discoveryUrl,
            );
            if (links.length === 0) {
                throw new Error(`No VETTS tournaments discovered for ${year}`);
            }
            for (const link of links) tournaments.set(link.tournamentId, link.tournamentId);
        } catch (error) {
            failures.push(error instanceof Error ? error : new Error(String(error)));
        }
    }

    const ids = [...tournaments.keys()].slice(0, discoveryLimit());
    if (ids.length === 0) {
        throw new AggregateError(failures, 'No usable VETTS tournaments discovered');
    }
    if (failures.length > 0) {
        console.warn(new AggregateError(failures, 'Some VETTS calendar pages failed'));
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
