import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const consumerRoot = mkdtempSync(join(tmpdir(), 'tt-pwa-consumer-'));

let tarballPath;

try {
  const packed = JSON.parse(execFileSync(
    'npm',
    ['pack', distRoot, '--json'],
    { cwd: packageRoot, encoding: 'utf8' },
  ));
  tarballPath = join(packageRoot, packed[0].filename);

  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'tt-pwa-consumer-smoke',
    private: true,
    type: 'module',
    scripts: {
      build: 'vite build',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@wudong/tt-players-pwa': `file:${tarballPath}`,
      react: '^18.3.1',
      vite: '^6.2.0',
      'workbox-window': '^7.4.0',
    },
    devDependencies: {
      '@types/node': '^22.13.4',
      '@types/react': '^18.3.18',
      typescript: '^5.7.3',
    },
  }, null, 2)}\n`);

  writeFileSync(join(consumerRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: false,
      types: ['vite/client'],
    },
    include: ['src', 'vite.config.ts'],
  }, null, 2)}\n`);

  writeFileSync(join(consumerRoot, 'vite.config.ts'), `import { defineConfig } from 'vite';\nimport { createPWAPlugin } from '@wudong/tt-players-pwa/vite';\n\nexport default defineConfig({\n  plugins: [\n    createPWAPlugin({\n      manifest: {\n        name: 'PWA Consumer Smoke',\n        short_name: 'Smoke',\n        display: 'standalone',\n        start_url: '/',\n      },\n    }),\n  ],\n});\n`);

  mkdirSync(join(consumerRoot, 'src'));
  writeFileSync(join(consumerRoot, 'src', 'main.ts'), `import {\n  PWAInstallProvider,\n  usePWAInstallContext,\n} from '@wudong/tt-players-pwa';\n\nvoid PWAInstallProvider;\nvoid usePWAInstallContext;\n\ndocument.querySelector<HTMLDivElement>('#app')!.textContent = 'ok';\n`);
  writeFileSync(join(consumerRoot, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n');

  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org'],
    { cwd: consumerRoot, stdio: 'inherit' },
  );
  execFileSync('npm', ['run', 'typecheck'], { cwd: consumerRoot, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: consumerRoot, stdio: 'inherit' });
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true });
  rmSync(consumerRoot, { recursive: true, force: true });
}
