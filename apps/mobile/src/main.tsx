import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './design-tokens.css';
import '../../../packages/design-system/src/styles/tokens.css';
import '../../../packages/design-system/src/styles/primitives.css';
import './native-mobile.css';
import './density-pass.css';
import './uncarded-density.css';
import './h2h.css';
import { AppRouter } from './AppRouter';
import { restoreLocalDataBackup } from './local-persistence';

restoreLocalDataBackup();

const rememberedTheme = window.localStorage.getItem('TTPlayers-Theme');
if (rememberedTheme === 'dark-mode') {
  document.body.classList.add('theme-dark');
  document.body.classList.remove('theme-light', 'detect-theme');
} else {
  document.body.classList.add('theme-light');
  document.body.classList.remove('theme-dark', 'detect-theme');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>,
);
