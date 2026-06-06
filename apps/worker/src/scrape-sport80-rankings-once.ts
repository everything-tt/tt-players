import dotenv from 'dotenv';
import { scrapeSport80RankingsDiscoveryTask } from './tasks/scrapeSport80RankingsDiscoveryTask.js';
import { scrapeSport80RankingTableTask } from './tasks/scrapeSport80RankingTableTask.js';

dotenv.config();

const allPeriods = process.env['SPORT80_RANKINGS_ALL_PERIODS'] === '1';
const maxPeriodsRaw = process.env['SPORT80_RANKINGS_MAX_PERIODS'];
const maxPeriods = maxPeriodsRaw ? Number(maxPeriodsRaw) : undefined;
const includeRatingsList = process.env['SPORT80_RANKINGS_INCLUDE_RATINGS'] !== '0';

const helpers = {
    logger: {
        info: (message: string) => console.log(message),
    },
    addJob: async (name: string, payload: unknown) => {
        console.log(`scrape-sport80-rankings-once: ${name} ${JSON.stringify(payload)}`);
        if (name === 'scrapeSport80RankingTableTask') {
            await scrapeSport80RankingTableTask(payload, helpers as any);
            return;
        }
        if (name === 'scrapeSport80RankingsDiscoveryTask') {
            await scrapeSport80RankingsDiscoveryTask(payload, helpers as any);
            return;
        }
        throw new Error(`Unsupported task ${name}`);
    },
};

await scrapeSport80RankingsDiscoveryTask({
    allPeriods,
    maxPeriods,
    includeRatingsList,
}, helpers as any);
