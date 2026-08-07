import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const consumerRoot = mkdtempSync(join(tmpdir(), 'tt-ranking-consumer-'));
let tarballPath;

try {
  const packed = JSON.parse(execFileSync(
    'npm',
    ['pack', distRoot, '--json'],
    { cwd: packageRoot, encoding: 'utf8' },
  ));
  tarballPath = join(packageRoot, packed[0].filename);

  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'tt-ranking-consumer-smoke',
    private: true,
    type: 'module',
    dependencies: {
      '@wudong/tt-players-ranking': `file:${tarballPath}`,
    },
  }, null, 2)}\n`);

  writeFileSync(join(consumerRoot, 'index.mjs'), `import assert from 'node:assert/strict';\nimport { defaultRatingState, updateRating } from '@wudong/tt-players-ranking';\n\nconst initial = defaultRatingState();\nconst updated = updateRating(initial, [{ opponentRating: 1800, opponentDeviation: 80, score: 1 }]);\nassert.ok(updated.rating > initial.rating);\nassert.ok(updated.conservativeRating < updated.rating);\n`);

  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'],
    { cwd: consumerRoot, stdio: 'inherit' },
  );
  execFileSync('node', ['index.mjs'], { cwd: consumerRoot, stdio: 'inherit' });
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true });
  rmSync(consumerRoot, { recursive: true, force: true });
}
