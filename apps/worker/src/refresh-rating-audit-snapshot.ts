import dotenv from 'dotenv';
import { bumpDataVersion, db } from '@tt-players/db';
import { refreshRatingAuditSnapshot } from './ratings/rating-audit-snapshot.js';

dotenv.config();

const modelArg = process.argv.find((arg: string) => arg.startsWith('--model='));
const modelKey = modelArg?.split('=')[1];

try {
    const generatedAt = await refreshRatingAuditSnapshot(db, modelKey);
    const version = await bumpDataVersion(db, 'rating-audit');

    console.log(`Rating audit snapshot refreshed at ${generatedAt.toISOString()}`);
    console.log(`Rating audit data version: ${version}`);
    console.log(`RATING_AUDIT_SNAPSHOT=${JSON.stringify({
        generatedAt: generatedAt.toISOString(),
        model: modelKey ?? 'global-singles-glicko2-v1',
        version,
    })}`);
} finally {
    await db.destroy();
}
