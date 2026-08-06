import dotenv from 'dotenv';
import { bumpDataVersion, db } from '@tt-players/db';
import { refreshCurrentRankings } from './ratings/current-rankings.js';
import { refreshRatingAuditIssues } from './ratings/rating-audit-issues.js';
import { refreshRatingAuditSnapshot } from './ratings/rating-audit-snapshot.js';
import { refreshRatingPlayerCoverage } from './ratings/rating-player-coverage.js';
import { refreshRatingSourceQuality } from './ratings/rating-source-quality.js';

dotenv.config();

const modelArg = process.argv.find((arg: string) => arg.startsWith('--model='));
const modelKey = modelArg?.split('=')[1];

try {
    const generatedAt = await refreshRatingAuditSnapshot(db, modelKey);
    await refreshRatingAuditIssues(db, generatedAt, modelKey);
    await refreshRatingPlayerCoverage(db, generatedAt, modelKey);
    const issueCount = await refreshRatingSourceQuality(db, generatedAt, modelKey);
    const ranking = await refreshCurrentRankings(db, modelKey, generatedAt);
    const version = await bumpDataVersion(db, 'rating-audit');

    console.log(`Rating audit snapshot refreshed at ${generatedAt.toISOString()}`);
    console.log(`Rating audit active issues: ${issueCount}`);
    console.log(`Current ranked players: ${ranking.rankedPlayers}/${ranking.totalPlayers}`);
    console.log(`Rating audit data version: ${version}`);
    console.log(`RATING_AUDIT_SNAPSHOT=${JSON.stringify({
        generatedAt: generatedAt.toISOString(),
        model: modelKey ?? 'global-singles-glicko2-v1',
        issueCount,
        rankedPlayers: ranking.rankedPlayers,
        version,
    })}`);
} finally {
    await db.destroy();
}
