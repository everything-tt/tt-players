import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { db } from '@tt-players/db';
import { inspectPendingTournamentEntryForms } from './entry-form-inspection.js';
import { parseTournamentEntryFormBackfillOptions } from './backfill-tournament-entry-form-options.js';
import { collectTournamentEntryFormBackfillDiagnostics } from './entry-form-backfill-diagnostics.js';

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim()
        ? error.message.replace(/\s+/g, ' ').slice(0, 500)
        : 'Could not collect entry form diagnostics.';
}

export async function runTournamentEntryFormBackfill(): Promise<void> {
    const options = parseTournamentEntryFormBackfillOptions();
    const summary = await inspectPendingTournamentEntryForms(db, options);

    let diagnosticCollectionError: string | null = null;
    let diagnostics = [];
    try {
        diagnostics = await collectTournamentEntryFormBackfillDiagnostics(db, options.limit);
    } catch (error) {
        diagnosticCollectionError = errorMessage(error);
    }

    console.log(JSON.stringify({
        ...summary,
        diagnostics,
        diagnostic_collection_error: diagnosticCollectionError,
    }, null, 2));
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
