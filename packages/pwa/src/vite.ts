import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';

export const DEFAULT_PWA_ASSETS = [
  'favicon.ico',
  'apple-touch-icon.png',
  'masked-icon.svg',
] as const;

export const DEFAULT_PWA_GLOB_PATTERNS = [
  '**/*.{js,css,html,ico,png,svg,woff,woff2}',
] as const;

export function createPWAPlugin(options: VitePWAOptions = {}) {
  return VitePWA({
    registerType: 'prompt',
    includeAssets: [...DEFAULT_PWA_ASSETS],
    ...options,
    workbox: {
      globPatterns: [...DEFAULT_PWA_GLOB_PATTERNS],
      ...(options.workbox ?? {}),
    },
  });
}

export type { VitePWAOptions };
