# React + TypeScript + Vite

## Player profile SSR on Netlify

The mobile app remains a normal Vite SPA for local development and for every route except the canonical public player profile document route, `/players/:playerId`.

- `pnpm --filter @tt-players/mobile dev` starts the existing Vite development server.
- `pnpm --filter @tt-players/mobile build` builds the browser app, the targeted player SSR bundle, and the generated Netlify HTML-template module.
- Netlify rewrites only `/players/:playerId` to the standard `player-ssr` Function. All `/tabs/*`, deeper player routes, and other routes keep the SPA fallback.
- The Function requires a **server-only** Netlify runtime environment variable named `SSR_API_ORIGIN`, containing an absolute backend origin such as `https://api.example.test`. Do not expose this as a `VITE_*` variable. The Function appends `/api` itself and fetches the backend directly.
- Configure `SSR_API_ORIGIN` for production and deploy-preview contexts in Netlify so both environments exercise the same SSR path.
- The service worker excludes canonical `/players/:playerId` document navigations from the SPA navigation fallback, so a hard refresh still reaches Netlify SSR after the PWA has been installed.

The generated `netlify/functions/player-template.mjs` file is produced from the built Vite `dist/index.html` and is intentionally ignored by Git. It is deployed together with `netlify/functions/player-ssr.mjs` by the frontend GitHub Action.

This template also provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Other configs...
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
