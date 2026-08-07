# TT Players PWA

Reusable PWA runtime and Vite configuration used by TT Players apps.

Published package: `@wudong/tt-players-pwa` on GitHub Packages.

## What it owns

- install prompt capture for browsers that support `beforeinstallprompt`
- iOS home-screen guidance state
- install-prompt dismissal cooldown
- service-worker update detection and activation
- optional persistent-storage request before an update
- an app lifecycle hook (`onBeforeUpdate`) so each app can protect its own local data
- shared `vite-plugin-pwa` defaults for prompt-based updates, common assets, and Workbox precaching

It intentionally does **not** own app-specific UI. Consumers render their own install/update sheets using `usePWAInstallContext()`.

## Vite setup

```ts
import { createPWAPlugin } from '@wudong/tt-players-pwa/vite';

export default defineConfig({
  plugins: [
    createPWAPlugin({
      manifest: {
        name: 'My App',
        short_name: 'MyApp',
        theme_color: '#17382f',
        background_color: '#f1f8f2',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
```

The helper defaults to `registerType: 'prompt'`, includes the standard favicon/apple/mask assets, and precaches JS, CSS, HTML, icons, images, SVG, and web fonts. Any `vite-plugin-pwa` option can still be overridden by the app.

## React runtime

```tsx
import {
  PWAInstallProvider,
  usePWAInstallContext,
} from '@wudong/tt-players-pwa';

function Root({ children }: { children: React.ReactNode }) {
  return (
    <PWAInstallProvider
      onBeforeUpdate={() => {
        // Optional: persist or back up app-specific local state.
      }}
    >
      {children}
    </PWAInstallProvider>
  );
}

function UpdateButton() {
  const { canUpdate, updateApp } = usePWAInstallContext();
  return canUpdate ? <button onClick={() => void updateApp()}>Update</button> : null;
}
```

The context also exposes `canInstall`, `triggerInstallPrompt`, `showAndroidSheet`, `showIosSheet`, `showUpdateSheet`, `install`, `dismiss`, and `dismissUpdate` so each product can provide its own UI.

## Publishing

This package is built, dry-run packed, and published by the same GitHub Actions workflow as the TT Players design system. Bump `packages/pwa/package.json` before changing a version that has already been published.
