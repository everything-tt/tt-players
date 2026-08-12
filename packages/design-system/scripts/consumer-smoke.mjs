import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
const consumerRoot = mkdtempSync(join(tmpdir(), 'tt-design-system-consumer-'));
let tarballPath;

try {
  const packed = JSON.parse(execFileSync(
    'npm',
    ['pack', distRoot, '--json'],
    { cwd: packageRoot, encoding: 'utf8' },
  ));
  tarballPath = join(packageRoot, packed[0].filename);

  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'tt-design-system-consumer-smoke',
    private: true,
    type: 'module',
    scripts: {
      build: 'vite build',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@wudong/tt-players-design-system': `file:${tarballPath}`,
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      vite: '^6.2.0',
    },
    devDependencies: {
      '@types/react': '^18.3.18',
      '@types/react-dom': '^18.3.5',
      '@vitejs/plugin-react': '^4.3.4',
      typescript: '^5.7.3',
    },
  }, null, 2)}\n`);

  writeFileSync(join(consumerRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src', 'vite.config.ts'],
  }, null, 2)}\n`);

  writeFileSync(join(consumerRoot, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
`);

  mkdirSync(join(consumerRoot, 'src'));
  writeFileSync(join(consumerRoot, 'src', 'main.tsx'), `import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  AppButton,
  AppTabBar,
  EmptyState,
  EntityHero,
  List,
  ListItem,
  MetricGrid,
  OutcomeBadge,
  Pill,
} from '@wudong/tt-players-design-system';
import '@wudong/tt-players-design-system/styles.css';

function App() {
  return (
    <main>
      <EntityHero eyebrow="Smoke" title="Published package" subtitle="Standalone consumer" />
      <MetricGrid ariaLabel="Metrics" columns={2} metrics={[{ label: 'Players', value: 12 }, { label: 'Tables', value: 4 }]} />
      <Pill tone="success">Online</Pill>
      <OutcomeBadge result="W" />
      <List divider="gap" size="lg">
        <ListItem title="Review tables" subtitle="4 configured" onClick={() => undefined} />
      </List>
      <EmptyState title="No active tables" message="Ready fixtures are in the queue." />
      <AppButton>Open queue</AppButton>
      <AppTabBar
        items={[{ id: 'home', label: 'Home', iconClassName: 'fa fa-home' }]}
        activeItemId="home"
        onItemClick={() => undefined}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`);

  writeFileSync(join(consumerRoot, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');

  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org'],
    { cwd: consumerRoot, stdio: 'inherit' },
  );
  execFileSync('npm', ['run', 'typecheck'], { cwd: consumerRoot, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: consumerRoot, stdio: 'inherit' });

  const assetsDir = join(consumerRoot, 'dist', 'assets');
  const css = readdirSync(assetsDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(join(assetsDir, name), 'utf8'))
    .join('\n');

  for (const selector of [
    '.tt-list-item',
    '.tt-pill',
    '.tt-empty-state',
    '.tt-outcome',
    '.tt-entity-hero',
    '.tt-tab-bar',
  ]) {
    if (!css.includes(selector)) {
      throw new Error(`Packed consumer CSS is missing ${selector}`);
    }
  }
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true });
  rmSync(consumerRoot, { recursive: true, force: true });
}
