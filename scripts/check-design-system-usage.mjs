import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

/* These files pre-date the package split and still act as canonical legacy
 * sources. New application CSS files must not be added here. */
const legacyCanonicalCssOwners = new Set([
  'app-shell.css',
  'design-tokens.css',
  'ratings-ui.css',
]);

/* Temporary selector-family exceptions. This is deliberately selector-level:
 * adding another canonical family to an existing file still fails CI until the
 * exception is documented here. */
const temporarySelectorAllowlist = new Map([
  ['player-insights.css', new Set(['badge', 'filter', 'list', 'metric', 'outcome', 'section'])],
  ['leagues-dashboard.css', new Set(['badge', 'outcome'])],
  ['my-tt.css', new Set(['button', 'metric', 'section', 'surface', 'toggle'])],
  ['h2h-ui.css', new Set(['section'])],
  ['ratings-enhancements.css', new Set(['pagination', 'section'])],
]);

const selectorBoundary = '(?=[\\s>+~.,:#\\[\\](){}]|$)';

function familyPattern(...baseClassNames) {
  const bases = baseClassNames
    .map((base) => base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`\\.(?:${bases})(?:[-_][A-Za-z0-9_-]*)?${selectorBoundary}`);
}

const canonicalSelectorFamilies = [
  { name: 'app-shell', pattern: familyPattern('tt-app-shell', 'tt-page-content', 'tt-app-header', 'tt-root-header', 'tt-root-content', 'tt-tab-bar') },
  { name: 'list', pattern: familyPattern('tt-list') },
  { name: 'avatar', pattern: familyPattern('tt-avatar') },
  { name: 'button', pattern: familyPattern('tt-btn') },
  { name: 'toggle', pattern: familyPattern('tt-toggle-button') },
  { name: 'segmented', pattern: familyPattern('tt-segmented', 'tt-segmented-control') },
  { name: 'section', pattern: familyPattern('tt-section') },
  { name: 'entity-hero', pattern: familyPattern('tt-entity-hero') },
  { name: 'metric', pattern: familyPattern('tt-metric') },
  { name: 'filter', pattern: familyPattern('tt-filter-bar') },
  { name: 'search', pattern: familyPattern('tt-app-search') },
  { name: 'surface', pattern: familyPattern('tt-surface', 'tt-stack', 'tt-inline') },
  { name: 'card', pattern: familyPattern('tt-card') },
  { name: 'state', pattern: familyPattern('tt-state', 'tt-empty-state', 'tt-error-state', 'tt-loading-card') },
  { name: 'badge', pattern: familyPattern('tt-pill', 'tt-rank-badge', 'tt-icon-circle') },
  { name: 'outcome', pattern: familyPattern('tt-outcome') },
  { name: 'overlay', pattern: familyPattern('tt-sheet', 'tt-backdrop', 'tt-modal-layer') },
  { name: 'pagination', pattern: familyPattern('tt-infinite-list-footer') },
  { name: 'match-record', pattern: familyPattern('tt-match-record') },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

export function extractRulePreludes(source) {
  const preludes = [];
  let buffer = '';
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (character === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && character === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      buffer += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      buffer += character;
      continue;
    }

    if (character === '{') {
      const prelude = buffer.trim().replace(/\s+/g, ' ');
      if (
        prelude
        && !prelude.startsWith('@')
        && !/^(?:from|to|\d+(?:\.\d+)?%)$/i.test(prelude)
      ) {
        preludes.push(prelude);
      }
      buffer = '';
      continue;
    }

    if (character === '}') {
      buffer = '';
      continue;
    }

    buffer += character;
  }

  return preludes;
}

export function getCanonicalFamilies(selector) {
  return canonicalSelectorFamilies
    .filter(({ pattern }) => pattern.test(selector))
    .map(({ name }) => name);
}

export function inspectTsxSource(relative, source) {
  const failures = [];

  if (!legacySectionAllowlist.has(relative) && /<section\s+className=["'`]tt-player-section/.test(source)) {
    failures.push(`${relative}: use PageSection instead of a new tt-player-section wrapper`);
  }

  if (!inlineGeometryAllowlist.has(relative)) {
    const inlineGeometry = /style=\{\{[^}]*\b(?:padding|margin|width|height|minHeight|maxWidth)\s*:/s;
    if (inlineGeometry.test(source)) {
      failures.push(`${relative}: move canonical layout geometry out of inline styles`);
    }
  }

  if (/\bapp-shell-content\b/.test(source)) {
    failures.push(`${relative}: use AppPageContent/design-system shell classes instead of the legacy app-shell-content hook`);
  }

  return { failures };
}

export function inspectCssSource(relative, source) {
  const basename = path.basename(relative);
  const failures = [];
  const exceptions = [];
  const uncommentedSource = source.replace(/\/\*[\s\S]*?\*\//g, '');

  if (!legacyCanonicalCssOwners.has(basename)) {
    const allowedFamilies = temporarySelectorAllowlist.get(relative)
      ?? temporarySelectorAllowlist.get(basename)
      ?? new Set();

    for (const selector of extractRulePreludes(source)) {
      for (const family of getCanonicalFamilies(selector)) {
        if (allowedFamilies.has(family)) {
          exceptions.push(`${relative}: ${family} (${selector})`);
        } else {
          failures.push(`${relative}: app CSS must not target canonical ${family} internals (${selector})`);
        }
      }
    }
  }

  const declaresCanonicalToken = /--tt-(?:gutter|row-height|avatar|control-height|header-height|root-header-height|tab-height)(?:-[a-z0-9-]+)?\s*:/i;
  if (basename !== 'design-tokens.css' && declaresCanonicalToken.test(source)) {
    failures.push(`${relative}: canonical geometry tokens belong in packages/design-system/src/styles/tokens.css`);
  }

  const screenPageInsetOverride = /\.tt-[A-Za-z0-9_-]+-page\b[^{}]*\{[^{}]*\bpadding-(?:top|bottom)\s*:/i;
  if (screenPageInsetOverride.test(uncommentedSource)) {
    failures.push(`${relative}: page-level top/bottom clearance belongs to AppPageContent and the design system`);
  }

  const legacyPageContentInsetOverride = /(?:\.page-content|\.app-shell-content)\b[^{}]*\{[^{}]*\bpadding-(?:top|bottom)\s*:/i;
  if (!legacyCanonicalCssOwners.has(basename) && legacyPageContentInsetOverride.test(uncommentedSource)) {
    failures.push(`${relative}: app CSS must not override page-content top/bottom shell clearance`);
  }

  return { failures, exceptions };
}

export async function runDesignSystemUsageCheck({ projectRoot = process.cwd() } = {}) {
  const mobileSrc = path.join(projectRoot, 'apps/mobile/src');
  const files = (await walk(mobileSrc)).filter((file) => /\.(tsx|ts|css)$/.test(file));
  const failures = [];
  const activeMigrationExceptions = [];

  for (const file of files) {
    const relative = path.relative(mobileSrc, file).replaceAll(path.sep, '/');
    const source = await readFile(file, 'utf8');

    if (file.endsWith('.tsx')) {
      const result = inspectTsxSource(relative, source);
      failures.push(...result.failures);
    }

    if (file.endsWith('.css')) {
      const result = inspectCssSource(relative, source);
      failures.push(...result.failures);
      activeMigrationExceptions.push(...result.exceptions);
    }
  }

  return {
    failures: [...new Set(failures)],
    activeMigrationExceptions,
  };
}

async function main() {
  const result = await runDesignSystemUsageCheck();
  if (result.failures.length > 0) {
    console.error('Design-system usage check failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Design-system usage check passed (${result.activeMigrationExceptions.length} documented selector exceptions remain).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
