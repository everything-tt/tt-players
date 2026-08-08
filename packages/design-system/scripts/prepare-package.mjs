import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const sourcePackage = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

function copyCssAssets(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyCssAssets(sourcePath, targetPath);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      cpSync(sourcePath, targetPath);
    }
  }
}

function verifyCompiledCssImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      verifyCompiledCssImports(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/(?:import|export)[^'\"]*['\"](\.[^'\"]+\.css)['\"]/g)) {
      const cssPath = resolve(dirname(path), match[1]);
      if (!existsSync(cssPath)) {
        throw new Error(`Missing published CSS asset for ${path}: ${match[1]}`);
      }
    }
  }
}

mkdirSync(distRoot, { recursive: true });
cpSync(join(packageRoot, 'src', 'styles'), join(distRoot, 'styles'), { recursive: true });
copyCssAssets(join(packageRoot, 'src', 'components'), join(distRoot, 'components'));
cpSync(join(packageRoot, 'README.md'), join(distRoot, 'README.md'));
verifyCompiledCssImports(distRoot);

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
