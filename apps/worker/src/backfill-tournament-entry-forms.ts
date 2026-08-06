import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { db } from '@tt-players/db';
import { inspectPendingTournamentEntryForms } from './entry-form-inspection.js';
import { parseTournamentEntryFormBackfillOptions } from './backfill-tournament-entry-form-options.js';

export async function runTournamentEntryFormBackfill(): Promise<void> {
    const options = parseTournamentEntryFormBackfillOptions();
    const summary = await inspectPendingTournamentEntryForms(db, options);
    console.log(JSON.stringify(summary, null, 2));
}

const currentModulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = entryPath === currentModulePath;

if (isDirectRun) {
    runTournamentEntryFormBackfill()
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await db.destroy();
        });
}
