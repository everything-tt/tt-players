import 'dotenv/config';
import { db } from '@tt-players/db';
import { inspectPendingTournamentEntryForms } from './entry-form-inspection.js';
import {
    defaultTteCalendarWindow,
    syncTteCalendarEvents,
} from './tte-events-sync.js';

function option(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
    const defaults = defaultTteCalendarWindow();
    const startMonth = option('start-month') ?? defaults.startMonth;
    const endMonth = option('end-month') ?? defaults.endMonth;
    const concurrency = Number(option('concurrency') ?? '4');

    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new Error('concurrency must be an integer between 1 and 8');
    }

    console.log(`Syncing TTE competition events from ${startMonth} through ${endMonth}`);
    const summary = await syncTteCalendarEvents(db, {
        startMonth,
        endMonth,
        concurrency,
    });
    console.log(JSON.stringify(summary, null, 2));

    const entryForms = await inspectPendingTournamentEntryForms(db);
    console.log(JSON.stringify({ entryForms }, null, 2));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
