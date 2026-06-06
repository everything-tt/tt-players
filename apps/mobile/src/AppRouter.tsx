import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import App from './App';
import { FixturePage } from './FixturePage';
import { isAppTab, TabNavigationProvider } from './navigation/tab-navigation';
import { PlayerInsightsPage } from './PlayerInsightsPage';
import { PlayerMatchesPage } from './PlayerMatchesPage';
import { PlayerPage } from './PlayerPage';
import { TeamPage } from './TeamPage';
import PWAReloadPrompt from './PWAReloadPrompt';
import PWAInstallSheet from './PWAInstallSheet';
import { PWAInstallProvider } from './PWAInstallContext';
import { ThemeProvider } from './ui/appkit';

function LegacyPlayerRedirect() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  return <Navigate to={`/tabs/players/player/${playerId}`} replace />;
}

function LegacyPlayerInsightsRedirect() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  return <Navigate to={`/tabs/players/player/${playerId}/insights`} replace />;
}

function LegacyPlayerMatchesRedirect() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  return <Navigate to={`/tabs/players/player/${playerId}/matches`} replace />;
}

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
    <HashRouter>
      <ThemeProvider>
        <PWAInstallProvider>
          <PWAReloadPrompt />
          <PWAInstallSheet />
          <TabNavigationProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/tabs/home" replace />} />

            <Route path="/tabs/:tabId" element={<EnsureValidTab><App /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/player/:playerId" element={<EnsureValidTab><PlayerPage /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/player/:playerId/insights" element={<EnsureValidTab><PlayerInsightsPage /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/player/:playerId/matches" element={<EnsureValidTab><PlayerMatchesPage /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/team/:teamId" element={<EnsureValidTab><TeamPage /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/fixture/:fixtureId" element={<EnsureValidTab><FixturePage /></EnsureValidTab>} />
            <Route path="/tabs/:tabId/*" element={<TabRootRedirect />} />

            <Route path="/players/:playerId" element={<LegacyPlayerRedirect />} />
            <Route path="/players/:playerId/insights" element={<LegacyPlayerInsightsRedirect />} />
            <Route path="/players/:playerId/matches" element={<LegacyPlayerMatchesRedirect />} />

            <Route path="*" element={<Navigate to="/tabs/home" replace />} />
          </Routes>
          </TabNavigationProvider>
        </PWAInstallProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
