import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { fetchVettsDiscovery } from './vetts-client.js';
import { parseVettsTournamentLinks } from './vetts-parser.js';
import { syncVettsTournament } from './vetts-sync.js';

dotenv.config();

async function main(): Promise<void> {
    const suppliedIds = process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const tournamentIds = suppliedIds.length > 0
        ? suppliedIds
        : parseVettsTournamentLinks(await fetchVettsDiscovery())
            .slice(0, Number(process.env['VETTS_DISCOVERY_LIMIT'] ?? 30))
            .map((tournament) => tournament.tournamentId);

    if (tournamentIds.length === 0) {
        throw new Error('No VETTS tournaments discovered. Pass one or more tournament UUIDs explicitly.');
    }

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
