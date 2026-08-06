import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import App from './App';
import './ratings-enhancements.css';
import './mobile-polish.css';
import { AboutPage } from './AboutPage';
import { CommonOpponentsPage } from './CommonOpponentsPage';
import { DataCoveragePage } from './DataCoveragePage';
import { DesignSystemPage } from './DesignSystemPage';
import { FixturePage } from './FixturePage';
import { isAppTab, TabNavigationProvider } from './navigation/tab-navigation';
import { MatchJournalPage } from './MatchJournalPage';
import { EditMyTTPage, MyTTPage } from './MyTTPage';
import { PlayerInsightsPage } from './PlayerInsightsPage';
import { PlayerMatchesPage } from './PlayerMatchesPage';
import { PlayerTournamentsPage } from './PlayerTournamentsPage';
import { PlayerPage } from './PlayerPage';
import { RatingAuditHealthPage } from './RatingAuditHealthPage';
import { RatingAuditPage } from './RatingAuditPage';
import { RatingPlayerCoveragePage } from './RatingPlayerCoveragePage';
import { RatingRankingQualityPage } from './RatingRankingQualityPage';
import { RatingSourceQualityPage } from './RatingSourceQualityPage';
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
  if (!isAppTab(tabId)) return <Navigate to="/tabs/home" replace />;
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
                <Route path="/tabs/:tabId/my-tt" element={<EnsureValidTab><MyTTPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/my-tt/edit" element={<EnsureValidTab><EditMyTTPage /></EnsureValidTab>} />
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
                <Route path="/tabs/:tabId/h2h/:playerAId/:playerBId/common-opponents" element={<EnsureValidTab><CommonOpponentsPage /></EnsureValidTab>} />
                <Route path="/tabs/:tabId/*" element={<TabRootRedirect />} />

                <Route path="/about" element={<AboutPage />} />
                <Route path="/data-coverage" element={<DataCoveragePage />} />
                <Route path="/design-system" element={<DesignSystemPage />} />
                <Route path="/rating-audit" element={<RatingAuditHealthPage section="overview" />} />
                <Route path="/rating-audit/player" element={<RatingAuditPage />} />
                <Route path="/rating-audit/player/:playerId" element={<RatingAuditPage />} />
                <Route path="/rating-audit/coverage" element={<RatingPlayerCoveragePage />} />
                <Route path="/rating-audit/sources" element={<RatingSourceQualityPage />} />
                <Route path="/rating-audit/ranking" element={<RatingRankingQualityPage />} />
                <Route path="/rating-audit/data" element={<RatingAuditHealthPage section="data" />} />
                <Route path="/rating-audit/identities" element={<RatingAuditHealthPage section="identities" />} />
                <Route path="/rating-audit/network" element={<RatingAuditHealthPage section="network" />} />
                <Route path="/rating-audit/:playerId" element={<RatingAuditPage />} />
                <Route path="/players/:playerId" element={<PlayerPage />} />
                <Route path="/players/:playerId/insights" element={<PlayerInsightsPage />} />
                <Route path="/players/:playerId/matches" element={<PlayerMatchesPage />} />
                <Route path="/players/:playerId/tournaments" element={<PlayerTournamentsPage />} />
                <Route path="/players/:playerId/journal" element={<MatchJournalPage />} />
                <Route path="/teams/:teamId" element={<TeamPage />} />
                <Route path="/tournaments/:eventId" element={<EventDetailPage />} />
                <Route path="/h2h/:playerAId/:playerBId/common-opponents" element={<CommonOpponentsPage />} />
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
