import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { inspectPendingTournamentEntryForms } from '../entry-form-inspection.js';
import {
    defaultTteCalendarWindow,
    syncTteCalendarEvents,
} from '../tte-events-sync.js';

export interface ScrapeTteCalendarEventsPayload {
    startMonth?: string;
    endMonth?: string;
    concurrency?: number;
}

export const scrapeTteCalendarEventsTask: Task = async (payload, helpers) => {
    const defaults = defaultTteCalendarWindow();
    const {
        startMonth = defaults.startMonth,
        endMonth = defaults.endMonth,
        concurrency = 4,
    } = payload as ScrapeTteCalendarEventsPayload;

    helpers.logger.info(
        `scrapeTteCalendarEventsTask: syncing ${startMonth} through ${endMonth}`,
    );
    const summary = await syncTteCalendarEvents(db, {
        startMonth,
        endMonth,
        concurrency,
    });
    helpers.logger.info(`scrapeTteCalendarEventsTask: ${JSON.stringify(summary)}`);

    const entryForms = await inspectPendingTournamentEntryForms(db);
    helpers.logger.info(`scrapeTteCalendarEventsTask entry forms: ${JSON.stringify(entryForms)}`);
};
