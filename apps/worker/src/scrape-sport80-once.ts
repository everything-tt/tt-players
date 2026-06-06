import dotenv from 'dotenv';
import { scrapeSport80EventResultsTask } from './tasks/scrapeSport80EventResultsTask.js';
import { scrapeSport80EventsTask } from './tasks/scrapeSport80EventsTask.js';

dotenv.config();

const limit = Number(process.env['SPORT80_SCRAPE_LIMIT'] ?? '100');
const maxPages = Number(process.env['SPORT80_SCRAPE_MAX_PAGES'] ?? '3');
const categoryRaw = process.env['SPORT80_SCRAPE_CATEGORY'];
const category = categoryRaw ? Number(categoryRaw) : undefined;
const force = process.env['SPORT80_SCRAPE_FORCE'] === '1';

const helpers = {
    logger: {
        info: (message: string) => console.log(message),
    },
    addJob: async (name: string, payload: unknown) => {
        console.log(`scrape-sport80-once: ${name} ${JSON.stringify(payload)}`);
        if (name === 'scrapeSport80EventResultsTask') {
            await scrapeSport80EventResultsTask(payload, helpers as any);
            return;
        }
        if (name === 'scrapeSport80EventsTask') {
            await scrapeSport80EventsTask(payload, helpers as any);
            return;
        }
        throw new Error(`Unsupported task ${name}`);
    },
};

await scrapeSport80EventsTask({
    limit,
    maxPages,
    force,
    ...(category == null ? {} : { category }),
}, helpers as any);
