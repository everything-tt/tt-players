import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import App from './App';
import { FixturePage } from './FixturePage';
import { isAppTab, TabNavigationProvider } from './navigation/tab-navigation';
import { PlayerInsightsPage } from './PlayerInsightsPage';
import { PlayerMatchesPage } from './PlayerMatchesPage';
import { PlayerTournamentsPage } from './PlayerTournamentsPage';
import { PlayerPage } from './PlayerPage';
import { TeamPage } from './TeamPage';
import { EventDetailPage } from './EventDetailPage';
import { LeagueDetailPage } from './LeagueDetailPage';
import PWAReloadPrompt from './PWAReloadPrompt';
import PWAInstallSheet from './PWAInstallSheet';
import { PWAInstallProvider } from './PWAInstallContext';
import { ThemeProvider } from './ui/appkit';

function TabRootRedirect() {
  const { tabId = 'home' } = useParams<{ tabId: string }>();
  const safeTab = isAppTab(tabId) ? tabId : 'home';
  return <Navigate to={`/tabs/${safeTab}`} replace />;
}

function EnsureValidTab({ children }: { children: JSX.Element }) {
  const { tabId = '' } = useParams<{ tabId: string }>();
  if (!isAppTab(tabId)) {
    return <Navigate to="/tabs/home" replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PWAInstallProvider>
          <PWAReloadPrompt />
          <PWAInstallSheet />
          <TabNavigationProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/tabs/home" replace />} />

              <Route path="/tabs/:tabId" element={<EnsureValidTab><App /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/event/:eventId" element={<EnsureValidTab><EventDetailPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/player/:playerId" element={<EnsureValidTab><PlayerPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/player/:playerId/insights" element={<EnsureValidTab><PlayerInsightsPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/player/:playerId/matches" element={<EnsureValidTab><PlayerMatchesPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/player/:playerId/tournaments" element={<EnsureValidTab><PlayerTournamentsPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/team/:teamId" element={<EnsureValidTab><TeamPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/league/:leagueId" element={<EnsureValidTab><LeagueDetailPage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/fixture/:fixtureId" element={<EnsureValidTab><FixturePage /></EnsureValidTab>} />
              <Route path="/tabs/:tabId/*" element={<TabRootRedirect />} />

              <Route path="/players/:playerId" element={<PlayerPage />} />
              <Route path="/players/:playerId/insights" element={<PlayerInsightsPage />} />
              <Route path="/players/:playerId/matches" element={<PlayerMatchesPage />} />
              <Route path="/players/:playerId/tournaments" element={<PlayerTournamentsPage />} />

              <Route path="*" element={<Navigate to="/tabs/home" replace />} />
            </Routes>
          </TabNavigationProvider>
        </PWAInstallProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
