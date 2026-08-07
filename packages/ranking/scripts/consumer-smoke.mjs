import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const packageRoot = new URL('..', import.meta.url).pathname;
const distRoot = join(packageRoot, 'dist');
const tempRoot = mkdtempSync(join(tmpdir(), 'tt-ranking-consumer-'));

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

  writeFileSync(join(tempRoot, 'consumer.mjs'), `
import {
  DEFAULT_GLICKO2_CONFIG,
  conservativeRating,
  defaultRatingState,
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
`);

  execFileSync('node', ['consumer.mjs'], { cwd: tempRoot, stdio: 'inherit' });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
