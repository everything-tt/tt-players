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
  ['native-mobile.css', new Set(['button', 'overlay', 'segmented'])],
  ['player-insights.css', new Set(['badge', 'filter', 'list', 'metric', 'outcome', 'section'])],
  ['leagues-dashboard.css', new Set(['badge', 'button', 'entity-hero', 'filter', 'list', 'metric', 'outcome', 'section'])],
  ['my-tt.css', new Set(['button', 'inline', 'metric', 'section', 'toggle'])],
  ['h2h-ui.css', new Set(['section'])],
  ['ratings-enhancements.css', new Set(['pagination', 'section'])],
]);

const canonicalSelectorFamilies = [
  {
    name: 'app-shell',
    pattern: /\.tt-(?:app-shell|page-content|app-header(?:__|--)?|tab-bar(?:__|--)?)(?=[\s>+~.,:#\[\](){}]|$)/,
  },
  {
    name: 'list',
    pattern: /\.tt-list(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-item|-cols|-divider)/,
  },
  {
    name: 'avatar',
    pattern: /\.tt-avatar(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'button',
    pattern: /\.tt-btn(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-rounded|-weight)/,
  },
  {
    name: 'toggle',
    pattern: /\.tt-toggle-button(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'segmented',
    pattern: /\.tt-segmented(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-control)/,
  },
  {
    name: 'section',
    pattern: /\.tt-section(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-header|-divider)/,
  },
  {
    name: 'entity-hero',
    pattern: /\.tt-entity-hero(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'metric',
    pattern: /\.tt-metric(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-grid)/,
  },
  {
    name: 'filter',
    pattern: /\.tt-filter-bar(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'search',
    pattern: /\.tt-app-search(?:$|(?=[\s>+~.,:#\[\](){}])|--|__|-input|-toolbar)/,
  },
  {
    name: 'surface',
    pattern: /\.tt-(?:surface|stack|inline)(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'inline',
    pattern: /\.tt-inline(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'card',
    pattern: /\.tt-card(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'state',
    pattern: /\.tt-(?:state|empty-state|error-state|loading-card)(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'badge',
    pattern: /\.tt-(?:pill|rank-badge|icon-circle)(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'outcome',
    pattern: /\.tt-outcome(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'overlay',
    pattern: /\.tt-(?:sheet|backdrop|modal-layer)(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'pagination',
    pattern: /\.tt-infinite-list-footer(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
  {
    name: 'match-record',
    pattern: /\.tt-match-record(?:$|(?=[\s>+~.,:#\[\](){}])|--|__)/,
  },
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

function extractRulePreludes(source) {
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

function getCanonicalFamilies(selector) {
  return canonicalSelectorFamilies
    .filter(({ pattern }) => pattern.test(selector))
    .map(({ name }) => name);
}

const files = (await walk(mobileSrc)).filter((file) => /\.(tsx|ts|css)$/.test(file));
const failures = [];
const activeMigrationExceptions = [];

for (const file of files) {
  const relative = path.relative(mobileSrc, file).replaceAll(path.sep, '/');
  const basename = path.basename(file);
  const source = await readFile(file, 'utf8');

  if (file.endsWith('.tsx')) {
    if (!legacySectionAllowlist.has(relative) && /<section\s+className=["'`]tt-player-section/.test(source)) {
      failures.push(`${relative}: use PageSection instead of a new tt-player-section wrapper`);
    }

    if (!inlineGeometryAllowlist.has(relative)) {
      const inlineGeometry = /style=\{\{[^}]*\b(?:padding|margin|width|height|minHeight|maxWidth)\s*:/s;
      if (inlineGeometry.test(source)) {
        failures.push(`${relative}: move canonical layout geometry out of inline styles`);
      }
    }
  }

  if (file.endsWith('.css')) {
    if (!legacyCanonicalCssOwners.has(basename)) {
      const allowedFamilies = temporarySelectorAllowlist.get(relative) ?? temporarySelectorAllowlist.get(basename) ?? new Set();
      for (const selector of extractRulePreludes(source)) {
        for (const family of getCanonicalFamilies(selector)) {
          if (allowedFamilies.has(family)) {
            activeMigrationExceptions.push(`${relative}: ${family} (${selector})`);
          } else {
            failures.push(
              `${relative}: app CSS must not target canonical ${family} internals (${selector})`,
            );
          }
        }
      }
    }

    const declaresCanonicalToken = /--tt-(?:gutter|row-height|avatar|control-height|header-height|root-header-height|tab-height)\s*:/;
    if (basename !== 'design-tokens.css' && declaresCanonicalToken.test(source)) {
      failures.push(`${relative}: canonical geometry tokens belong in packages/design-system/src/styles/tokens.css`);
    }
  }
}

if (failures.length > 0) {
  console.error('Design-system usage check failed:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Design-system usage check passed (${activeMigrationExceptions.length} documented selector exceptions remain).`);
