import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const tempRoot = mkdtempSync(join(tmpdir(), 'tt-ranking-consumer-'));
const tscBinary = join(
  packageRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);

try {
  const packResult = JSON.parse(execFileSync(
    'npm',
    ['pack', distRoot, '--json', '--pack-destination', tempRoot],
    { encoding: 'utf8' },
  ));
  const tarball = join(tempRoot, packResult[0].filename);

  writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({
    name: 'tt-ranking-consumer-smoke',
    private: true,
    type: 'module',
  }, null, 2));

  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    { cwd: tempRoot, stdio: 'inherit' },
  );

  writeFileSync(join(tempRoot, 'consumer.ts'), `
import {
  DEFAULT_CURRENT_RANKING_POLICY,
  DEFAULT_GLICKO2_CONFIG,
  conservativeRating,
  defaultRatingState,
  rankCurrentPlayers,
  updateRating,
  type CurrentRankingInput,
} from '@wudong/tt-players-ranking';

const initial = defaultRatingState();
const player: CurrentRankingInput = {
  playerId: 'consumer-player',
  state: initial,
  ratedMatches: DEFAULT_CURRENT_RANKING_POLICY.minimumMatches,
  uniqueOpponents: DEFAULT_CURRENT_RANKING_POLICY.minimumUniqueOpponents,
  daysInactive: 0,
};

const ranked = rankCurrentPlayers([player]);
const updated = updateRating(initial, [
  { opponentRating: 1500, opponentDeviation: 350, score: 1 },
]);

void ranked[0]?.eligibilityReason;
void conservativeRating(updated, DEFAULT_GLICKO2_CONFIG);
`);

  execFileSync(
    tscBinary,
    [
      '--noEmit',
      '--strict',
      '--target', 'ES2020',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      join(tempRoot, 'consumer.ts'),
    ],
    { cwd: tempRoot, stdio: 'inherit' },
  );

  writeFileSync(join(tempRoot, 'consumer.mjs'), `
import {
  DEFAULT_CURRENT_RANKING_POLICY,
  DEFAULT_GLICKO2_CONFIG,
  conservativeRating,
  defaultRatingState,
  rankCurrentPlayers,
  updateRating,
} from '@wudong/tt-players-ranking';

const initial = defaultRatingState();
if (initial.rating !== 1500 || initial.deviation !== 350) {
  throw new Error('Unexpected default rating state');
}

const updated = updateRating(initial, [
  { opponentRating: 1500, opponentDeviation: 350, score: 1 },
]);
if (!(updated.rating > initial.rating)) {
  throw new Error('Winning should increase rating');
}
if (updated.conservativeRating !== conservativeRating(updated, DEFAULT_GLICKO2_CONFIG)) {
  throw new Error('Published conservative rating API is inconsistent');
}

const ranked = rankCurrentPlayers([{
  playerId: 'consumer-player',
  state: { rating: 1700, deviation: 50, volatility: 0.06 },
  ratedMatches: DEFAULT_CURRENT_RANKING_POLICY.minimumMatches,
  uniqueOpponents: DEFAULT_CURRENT_RANKING_POLICY.minimumUniqueOpponents,
  daysInactive: 0,
}]);
if (ranked[0]?.currentRank !== 1 || ranked[0]?.eligibilityReason !== 'ranked') {
  throw new Error('Published current-ranking API is inconsistent');
}
`);

  execFileSync('node', ['consumer.mjs'], { cwd: tempRoot, stdio: 'inherit' });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
