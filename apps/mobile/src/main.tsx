import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
} from '@tanstack/react-query';
import './index.css';
import './design-tokens.css';
import '@tt-players/design-system/styles.css';
import './native-mobile.css';
import './density-pass.css';
import './uncarded-density.css';
import './h2h.css';
import './tournament-timeline.css';
import './tournament-filters.css';
import { AppRouter } from './AppRouter';
import { PlayerSsrHydrationBridge } from './PlayerSsrHydrationBridge';
import { restoreLocalDataBackup } from './local-persistence';
import { createMobileQueryClient } from './query-client';

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

const stateElement = document.getElementById('__TT_QUERY_STATE__');
let dehydratedState: DehydratedState | undefined;
if (stateElement?.textContent) {
  try {
    dehydratedState = JSON.parse(stateElement.textContent) as DehydratedState;
  } catch {
    dehydratedState = undefined;
  }
}

const shouldHydratePlayer = Boolean(stateElement && dehydratedState);
const queryClient = createMobileQueryClient();
const content = shouldHydratePlayer
  ? <PlayerSsrHydrationBridge />
  : <AppRouter />;
const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        {content}
      </HydrationBoundary>
    </QueryClientProvider>
  </StrictMode>
);

if (shouldHydratePlayer) {
  hydrateRoot(rootElement, app);
} else {
  rootElement.replaceChildren();
  createRoot(rootElement).render(app);
}
