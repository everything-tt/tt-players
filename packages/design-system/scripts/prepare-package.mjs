import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const sourcePackage = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

mkdirSync(distRoot, { recursive: true });
cpSync(join(packageRoot, 'src', 'styles'), join(distRoot, 'styles'), { recursive: true });
cpSync(join(packageRoot, 'README.md'), join(distRoot, 'README.md'));

const publishedPackage = {
  name: '@wudong/tt-players-design-system',
  version: sourcePackage.version,
  description: 'Shared TT Players React design system for mobile-first PWAs.',
  type: 'module',
  main: './index.js',
  module: './index.js',
  types: './index.d.ts',
  exports: {
    '.': {
      types: './index.d.ts',
      import: './index.js',
      default: './index.js',
    },
    './primitives': {
      types: './components/ui/index.d.ts',
      import: './components/ui/index.js',
      default: './components/ui/index.js',
    },
    './styles.css': './styles/index.css',
    './utils': {
      types: './lib/utils.d.ts',
      import: './lib/utils.js',
      default: './lib/utils.js',
    },
    './package.json': './package.json',
  },
  sideEffects: ['**/*.css'],
  peerDependencies: sourcePackage.peerDependencies,
  dependencies: sourcePackage.dependencies,
  engines: {
    node: '>=18.0.0',
  },
  repository: {
    type: 'git',
    url: 'git+https://github.com/wudong/tt-players.git',
    directory: 'packages/design-system',
  },
  homepage: 'https://github.com/wudong/tt-players/tree/main/packages/design-system',
  publishConfig: {
    registry: 'https://npm.pkg.github.com',
  },
};

writeFileSync(
  join(distRoot, 'package.json'),
  `${JSON.stringify(publishedPackage, null, 2)}\n`,
);
