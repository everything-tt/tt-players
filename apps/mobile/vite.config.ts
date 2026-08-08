import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createPWAPlugin } from '@tt-players/pwa/vite';
import { execSync } from 'node:child_process';

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const appBuildTime = new Date().toISOString();
const appCommit = getGitCommit();

export default defineConfig(({ isSsrBuild }) => ({
  define: {
    'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(appBuildTime),
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(appCommit),
  },
  plugins: [
    tailwindcss(),
    react(),
    ...(isSsrBuild === true ? [] : [
      createPWAPlugin({
        manifest: {
          name: 'TT Players',
          short_name: 'TTPlayers',
          description: 'Table Tennis League Results and Insights',
          theme_color: '#17382f',
          background_color: '#f1f8f2',
          display: 'standalone',
          icons: [
            {
              src: 'appkit/app/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'appkit/app/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // A direct/refresh navigation to the canonical player profile must hit
          // Netlify so the SSR Function can return player-specific HTML. Deeper
          // player routes continue to use the normal cached SPA navigation shell.
          navigateFallbackDenylist: [/^\/players\/[^/]+\/?$/],
        },
      }),
    ]),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
    },
  },
}));
