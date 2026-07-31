import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import App from './App';
import './ratings-enhancements.css';
import './mobile-polish.css';
import { AboutPage } from './AboutPage';
import { DataCoveragePage } from './DataCoveragePage';
import { FixturePage } from './FixturePage';
import { isAppTab, TabNavigationProvider } from './navigation/tab-navigation';
import { MatchJournalPage } from './MatchJournalPage';
import { PlayerInsightsPage } from './PlayerInsightsPage';
import { PlayerMatchesPage } from './PlayerMatchesPage';
import { PlayerTournamentsPage } from './PlayerTournamentsPage';
import { PlayerPage } from './PlayerPage';
import { TopRatingsPage } from './TopRatingsPage';
import { TeamPage } from './TeamPage';
import { EventDetailPage } from './EventDetailPage';
import { H2HPage } from './H2HPage';
import { LeagueDetailPage } from './LeagueDetailPage';
import PWAReloadPrompt from './PWAReloadPrompt';
import PWAInstallSheet from './PWAInstallSheet';
import { PWAInstallProvider } from './PWAInstallContext';
import { UserDataSyncProvider } from './UserDataSyncProvider';
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
      <UserDataSyncProvider>
        <ThemeProvider>
          <PWAInstallProvider>
            <PWAReloadPrompt />
            <PWAInstallSheet />
            <TabNavigationProvider>
              <Routes>
                <Route path="/" element={<Navigate to="/tabs/home" replace />} />

                <Route path="/tabs/:tabId" element={<EnsureValidTab><App /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/ratings" element={<EnsureValidTab><TopRatingsPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/event/:eventId" element={<EnsureValidTab><EventDetailPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/player/:playerId" element={<EnsureValidTab><PlayerPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/player/:playerId/insights" element={<EnsureValidTab><PlayerInsightsPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/player/:playerId/matches" element={<EnsureValidTab><PlayerMatchesPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/player/:playerId/tournaments" element={<EnsureValidTab><PlayerTournamentsPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/player/:playerId/journal" element={<EnsureValidTab><MatchJournalPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/team/:teamId" element={<EnsureValidTab><TeamPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/league/:leagueId" element={<EnsureValidTab><LeagueDetailPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/fixture/:fixtureId" element={<EnsureValidTab><FixturePage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/*" element={<TabRootRedirect />} />

                <Route path="/about" element={<AboutPage />} />
                <Route path="/data-coverage" element={<DataCoveragePage />} />
                <Route path="/players/:playerId" element={<PlayerPage />} />
                <Route path="/players/:playerId/insights" element={<PlayerInsightsPage />} />
                <Route path="/players/:playerId/matches" element={<PlayerMatchesPage />} />
                <Route path="/players/:playerId/tournaments" element={<PlayerTournamentsPage />} />
                <Route path="/players/:playerId/journal" element={<MatchJournalPage />} />
                <Route path="/teams/:teamId" element={<TeamPage />} />
                <Route path="/tournaments/:eventId" element={<EventDetailPage />} />
                <Route path="/h2h/:playerAId/:playerBId" element={<H2HPage />} />

                <Route path="*" element={<Navigate to="/tabs/home" replace />} />
              </Routes>
            </TabNavigationProvider>
          </PWAInstallProvider>
        </ThemeProvider>
      </UserDataSyncProvider>
    </BrowserRouter>
  );
}
