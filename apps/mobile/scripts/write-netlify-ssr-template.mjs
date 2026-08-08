import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(mobileRoot, '../..');
const sourcePath = path.join(mobileRoot, 'dist/index.html');
const functionsDir = path.join(repoRoot, 'netlify/functions');
const outputPath = path.join(functionsDir, 'player-template.mjs');

const template = await readFile(sourcePath, 'utf8');
for (const marker of ['<!--app-head-->', '<!--app-html-->', '<!--ssr-state-->']) {
  if (!template.includes(marker)) {
    throw new Error(`Built index.html is missing SSR marker: ${marker}`);
  }
}

await mkdir(functionsDir, { recursive: true });
await writeFile(
  outputPath,
  `// Generated from apps/mobile/dist/index.html. Do not edit.\nexport default ${JSON.stringify(template)};\n`,
  'utf8',
);
