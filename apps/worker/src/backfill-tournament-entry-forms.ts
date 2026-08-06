import 'dotenv/config';
import { db } from '@tt-players/db';
import { inspectPendingTournamentEntryForms } from './entry-form-inspection.js';

function numericOption(name: string, fallback: number): number {
    const prefix = `--${name}=`;
    const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
    const value = Number(raw ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 5_000) {
        throw new Error(`${name} must be an integer between 1 and 5000`);
    }
    return value;
}

async function main(): Promise<void> {
    const limit = numericOption('limit', 500);
    const summary = await inspectPendingTournamentEntryForms(db, { limit });
    console.log(JSON.stringify(summary, null, 2));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
