import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';

export const DEFAULT_PWA_ASSETS = [
  'favicon.ico',
  'apple-touch-icon.png',
  'masked-icon.svg',
] as const;

export const DEFAULT_PWA_GLOB_PATTERNS = [
  '**/*.{js,css,html,ico,png,svg,woff,woff2}',
] as const;

export type PWAPluginOptions = NonNullable<Parameters<typeof VitePWA>[0]>;

export function createPWAPlugin(
  options: PWAPluginOptions = {},
): ReturnType<typeof VitePWA> {
  const {
    registerType = 'prompt',
    includeAssets = [...DEFAULT_PWA_ASSETS],
    workbox,
    ...rest
  } = options;

  return VitePWA({
    ...rest,
    registerType,
    includeAssets,
    workbox: {
      globPatterns: [...DEFAULT_PWA_GLOB_PATTERNS],
      ...(workbox ?? {}),
    },
  });
}

export type { VitePWAOptions };
