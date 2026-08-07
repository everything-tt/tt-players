import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const sourcePackage = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

cpSync(join(packageRoot, 'README.md'), join(distRoot, 'README.md'));

const publishedPackage = {
  name: '@wudong/tt-players-ranking',
  version: sourcePackage.version,
  description: 'Dependency-free Glicko-2 rating and ranking helpers extracted from TT Players.',
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
    './package.json': './package.json',
  },
  engines: {
    node: '>=18.0.0',
  },
  repository: {
    type: 'git',
    url: 'git+https://github.com/wudong/tt-players.git',
    directory: 'libs/ranking',
  },
  homepage: 'https://github.com/wudong/tt-players/tree/main/libs/ranking',
  publishConfig: {
    registry: 'https://npm.pkg.github.com',
  },
};

writeFileSync(
  join(distRoot, 'package.json'),
  `${JSON.stringify(publishedPackage, null, 2)}\n`,
);
