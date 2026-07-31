import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mobileSrc = path.join(root, 'apps/mobile/src');
const legacySectionAllowlist = new Set([
  'App.tsx',
  'EventDetailPage.tsx',
  'H2HTabContent.tsx',
  'PlayerPage.tsx',
  'components/Skeleton.tsx',
]);
const inlineGeometryAllowlist = new Set([
  'H2HTabContent.tsx',
]);
const compatibilityCss = new Set([
  'mobile-polish.css',
  'density-pass.css',
  'uncarded-density.css',
  'app-shell.css',
  'ratings-ui.css',
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const failures = [];
for (const file of await walk(mobileSrc)) {
  const relative = path.relative(mobileSrc, file).replaceAll(path.sep, '/');
  const source = await readFile(file, 'utf8');

  const hasLegacySectionWrapper = /<section\b[^>]*className=(?:"tt-player-section|\{[^}]*['"]tt-player-section)/s.test(source);
  if (file.endsWith('.tsx') && hasLegacySectionWrapper && !legacySectionAllowlist.has(relative)) {
    failures.push(`${relative}: use PageSection instead of a new tt-player-section wrapper`);
  }

  const hasInlineGeometry = /style=\{\{[^}]*\b(?:padding|margin|width|height|minHeight|maxWidth)\s*:/s.test(source);
  if (file.endsWith('.tsx') && hasInlineGeometry && !inlineGeometryAllowlist.has(relative)) {
    failures.push(`${relative}: canonical geometry must use design-system variants, not inline style`);
  }

  if (file.endsWith('.css') && !compatibilityCss.has(relative)) {
    const canonicalGeometry = /--tt-(?:gutter|row-height|avatar|control-height|header-height|tab-height)\s*:/;
    if (canonicalGeometry.test(source)) {
      failures.push(`${relative}: canonical geometry tokens belong in packages/design-system/src/styles/tokens.css`);
    }
  }
}

if (failures.length > 0) {
  console.error('Design-system usage violations:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Design-system usage checks passed.');
