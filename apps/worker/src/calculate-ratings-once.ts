import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { calculateRatings } from './ratings/calculate-ratings.js';

dotenv.config();

const rebuild = process.argv.includes('--rebuild');
const maxPeriodsArg = process.argv.find((arg: string) => arg.startsWith('--max-periods='));
const modelArg = process.argv.find((arg: string) => arg.startsWith('--model='));
const maxPeriods = maxPeriodsArg
    ? Number.parseInt(maxPeriodsArg.split('=')[1] ?? '', 10)
    : 100000;
const modelKey = modelArg?.split('=')[1];

try {
    const result = await calculateRatings(
        db,
        {
            rebuild,
            maxPeriods: Number.isFinite(maxPeriods) ? maxPeriods : 100000,
            modelKey,
        },
        console.log,
    );
    console.log(JSON.stringify(result, null, 2));
} finally {
    await db.destroy();
}
