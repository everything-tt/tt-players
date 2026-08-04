import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './app-shell.css';
import './root-shell.css';
import { H2HTabContent } from './H2HTabContent';
import { HomeTabContent } from './HomeTabContent';
import { LeagueSelectionPage } from './LeagueSelectionPage';
import { LeaguesTabContent } from './LeaguesTabContent';
import { EventsTabContent } from './EventsTabContent';
import { PlayersTabContent } from './PlayersTabContent';
import { QuickFeedbackSheet } from './QuickFeedbackSheet';
import { TabFooterBar } from './TabFooterBar';
import { MainDrawer } from './components/MainDrawer';
import { RootHeader } from './components/RootHeader';
import { ShareSheet } from './components/ShareSheet';
import { useTabNavigation } from './navigation/tab-navigation';
import { useLeaguesQuery } from './queries';
import { usePWAInstallContext } from './PWAInstallContext';
import { useTheme } from './ui/appkit';
import { getQueryError, TAB_METADATA, type LeagueWithDivisions } from './player-shared';
import { buildHomeShareTarget, buildWebShareLinks, shareTarget } from './share-target';
import { LEAGUE_ONBOARDING_STORAGE_KEY, LEAGUES_STORAGE_KEY, restoreLocalDataBackup } from './local-persistence';

const MAX_SELECTED_LEAGUES = 15;

const APP_BUILD_TIME = formatBuildTime(import.meta.env.VITE_APP_BUILD_TIME);
const APP_COMMIT = import.meta.env.VITE_APP_COMMIT || 'unknown';

function formatBuildTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'unknown';
  return `${timestamp.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function parseStoredLeagueIds(): string[] {
  try {
    const raw = localStorage.getItem(LEAGUES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function hasCompletedStoredLeagueOnboarding(): boolean {
  return localStorage.getItem(LEAGUE_ONBOARDING_STORAGE_KEY) === 'true'
    || parseStoredLeagueIds().length > 0;
}

function App() {
  const navigate = useNavigate();
  const { activeTab, handleSystemBack, navigateInActiveTab, switchTab } = useTabNavigation();
  const { isDarkMode, toggleTheme } = useTheme();
  const {
    showAndroidSheet,
    showIosSheet,
    dismiss: dismissPWAInstall,
    triggerInstallPrompt,
    canInstall,
  } = usePWAInstallContext();

  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isLeagueSelectorOpen, setIsLeagueSelectorOpen] = useState(false);
  const [isFeedbackSheetOpen, setIsFeedbackSheetOpen] = useState(false);
  const [isLeagueSelectionReady, setIsLeagueSelectionReady] = useState(false);
  const [hasCompletedLeagueOnboarding, setHasCompletedLeagueOnboarding] = useState(() => hasCompletedStoredLeagueOnboarding());
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);

  const leaguesQuery = useLeaguesQuery();
  const allLeagues: LeagueWithDivisions[] = useMemo(
    () => (Array.isArray(leaguesQuery.data?.data) ? leaguesQuery.data.data : []),
    [leaguesQuery.data],
  );
  const allLeagueIds = useMemo(() => allLeagues.map((league) => league.id), [allLeagues]);
  const isLeaguesLoading = leaguesQuery.isLoading;
  const leaguesError = getQueryError(leaguesQuery.error);

  const hasSelectedLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;
  const isAllLeagueScope = hasSelectedLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;
  const selectedLeagueBadgeLabel = !hasCompletedLeagueOnboarding
    ? 'Choose'
    : isAllLeagueScope
      ? 'All'
      : selectedLeagueIds.length;

  const openLeagueSelector = () => {
    setIsMainMenuOpen(false);
    setIsFeedbackSheetOpen(false);
    setIsLeagueSelectorOpen(true);
  };

  const closeLeagueSelector = useCallback(() => {
    if (!hasCompletedLeagueOnboarding && selectedLeagueIds.length === 0 && !leaguesError) return;
    setIsLeagueSelectorOpen(false);
  }, [hasCompletedLeagueOnboarding, leaguesError, selectedLeagueIds.length]);

  const openFeedbackSheet = () => {
    setIsMainMenuOpen(false);
    setIsFeedbackSheetOpen(true);
  };

  const onSystemBackPressed = useCallback((): boolean => {
    if (isMainMenuOpen) {
      setIsMainMenuOpen(false);
      return true;
    }
    if (isShareSheetOpen) {
      setIsShareSheetOpen(false);
      return true;
    }
    if (showAndroidSheet || showIosSheet) {
      dismissPWAInstall();
      return true;
    }
    if (isFeedbackSheetOpen) {
      setIsFeedbackSheetOpen(false);
      return true;
    }
    if (isLeagueSelectorOpen) {
      closeLeagueSelector();
      return true;
    }
    return handleSystemBack();
  }, [
    closeLeagueSelector,
    dismissPWAInstall,
    handleSystemBack,
    isFeedbackSheetOpen,
    isLeagueSelectorOpen,
    isMainMenuOpen,
    isShareSheetOpen,
    showAndroidSheet,
    showIosSheet,
  ]);

  const addLeagueToSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      if (validPrevious.includes(leagueId)) return validPrevious;
      if (validPrevious.length >= MAX_SELECTED_LEAGUES) return validPrevious;
      return [...validPrevious, leagueId];
    });
    setHasCompletedLeagueOnboarding(true);
  };

  const removeLeagueFromSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      return previous.filter((id) => validIdSet.has(id) && id !== leagueId);
    });
  };

  const selectRegionLeagues = (leagueIds: string[]) => {
    if (leagueIds.length === 0 || allLeagueIds.length === 0) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      if (validPrevious.length >= MAX_SELECTED_LEAGUES) return validPrevious;
      const nextSelected = new Set(validPrevious);
      for (const leagueId of leagueIds) {
        if (!validIdSet.has(leagueId)) continue;
        if (nextSelected.size >= MAX_SELECTED_LEAGUES) break;
        nextSelected.add(leagueId);
      }
      return allLeagueIds.filter((leagueId) => nextSelected.has(leagueId));
    });
    setHasCompletedLeagueOnboarding(true);
  };

  useEffect(() => {
    restoreLocalDataBackup();
  }, []);

  useEffect(() => {
    if (isLeaguesLoading) return;
    if (leaguesError) {
      setSelectedLeagueIds([]);
      setIsLeagueSelectionReady(true);
      return;
    }
    const validLeagueIds = new Set(allLeagues.map((league) => league.id));
    const storedSelection = parseStoredLeagueIds().filter((id) => validLeagueIds.has(id));
    const storedOnboardingComplete = hasCompletedStoredLeagueOnboarding();
    setSelectedLeagueIds((previous) => {
      const validPrevious = previous.filter((id) => validLeagueIds.has(id));
      if (validPrevious.length > 0) return validPrevious.slice(0, MAX_SELECTED_LEAGUES);
      return storedOnboardingComplete && storedSelection.length > 0
        ? storedSelection.slice(0, MAX_SELECTED_LEAGUES)
        : [];
    });
    setHasCompletedLeagueOnboarding(storedOnboardingComplete && storedSelection.length > 0);
    setIsLeagueSelectionReady(true);
  }, [allLeagues, isLeaguesLoading, leaguesError]);

  useEffect(() => {
    if (!isLeagueSelectionReady) return;
    localStorage.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(selectedLeagueIds));
    if (hasCompletedLeagueOnboarding) {
      localStorage.setItem(LEAGUE_ONBOARDING_STORAGE_KEY, 'true');
    }
  }, [hasCompletedLeagueOnboarding, isLeagueSelectionReady, selectedLeagueIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isLeagueSelectorOpen) closeLeagueSelector();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeLeagueSelector, isLeagueSelectorOpen]);

  useEffect(() => {
    const onBackButton = (event: Event) => {
      event.preventDefault();
      onSystemBackPressed();
    };
    document.addEventListener('backbutton', onBackButton, false);
    return () => document.removeEventListener('backbutton', onBackButton, false);
  }, [onSystemBackPressed]);

  useEffect(() => {
    type CapacitorListenerHandle = { remove: () => void };
    type CapacitorAppPlugin = {
      addListener?: (eventName: string, listenerFunc: () => void) => CapacitorListenerHandle | Promise<CapacitorListenerHandle>;
      exitApp?: () => void;
    };
    type CapacitorGlobal = { Capacitor?: { App?: CapacitorAppPlugin; Plugins?: { App?: CapacitorAppPlugin } } };
    const capacitorGlobal = window as Window & CapacitorGlobal;
    const appPlugin = capacitorGlobal.Capacitor?.Plugins?.App ?? capacitorGlobal.Capacitor?.App;
    if (!appPlugin?.addListener) return;
    let isActive = true;
    let listenerHandle: CapacitorListenerHandle | null = null;
    const handleBack = () => {
      const handled = onSystemBackPressed();
      if (!handled) appPlugin.exitApp?.();
    };
    Promise.resolve(appPlugin.addListener('backButton', handleBack))
      .then((handle) => {
        if (!isActive) {
          handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => { /* not in a Capacitor container */ });
    return () => {
      isActive = false;
      listenerHandle?.remove();
    };
  }, [onSystemBackPressed]);

  const homeShareTarget = useMemo(() => buildHomeShareTarget(window.location.origin), []);
  const shareLinks = useMemo(() => buildWebShareLinks(homeShareTarget), [homeShareTarget]);

  const onShare = async () => {
    setIsMainMenuOpen(false);
    if (typeof navigator.share === 'function') {
      try {
        await shareTarget(homeShareTarget);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    setIsShareSheetOpen(true);
  };

  const openAbout = () => {
    navigate('/about', { state: { from: `/tabs/${activeTab}` } });
  };

  const setDarkMode = (enabled: boolean) => {
    if (enabled !== isDarkMode) toggleTheme();
  };

  return (
    <>
      <div id="page" className="app-shell-page">
        {!isLeagueSelectorOpen ? (
          <>
            <RootHeader
              title={TAB_METADATA[activeTab].label}
              leagueBadge={selectedLeagueBadgeLabel}
              onOpenMenu={() => setIsMainMenuOpen(true)}
              onOpenLeagues={openLeagueSelector}
              onOpenFeedback={openFeedbackSheet}
              onShare={activeTab === 'home' ? onShare : undefined}
            />

            <TabFooterBar reselectBehavior="root" />

            <main className="page-content app-shell-content tt-root-content">
              {activeTab === 'home' ? (
                <HomeTabContent
                  allLeagues={allLeagues}
                  hasCompletedLeagueOnboarding={hasCompletedLeagueOnboarding}
                  selectedLeagueIds={selectedLeagueIds}
                  onOpenLeagueSelector={openLeagueSelector}
                  onOpenTab={(tabId) => switchTab(tabId, 'root')}
                />
              ) : null}

              {activeTab === 'players' ? (
                <PlayersTabContent
                  selectedLeagueIds={selectedLeagueIds}
                  allLeaguesCount={allLeagues.length}
                  onOpenLeagueSelector={openLeagueSelector}
                  onOpenPlayer={(playerId) => navigateInActiveTab(`player/${playerId}`)}
                />
              ) : null}

              {activeTab === 'leagues' ? (
                <LeaguesTabContent
                  selectedLeagueIds={selectedLeagueIds}
                  onOpenLeagueSelector={openLeagueSelector}
                />
              ) : null}
              {activeTab === 'h2h' ? <H2HTabContent onOpenPlayer={(playerId) => navigateInActiveTab(`player/${playerId}`)} /> : null}
              {activeTab === 'events' ? <EventsTabContent /> : null}
            </main>
          </>
        ) : null}

        {isLeagueSelectorOpen ? (
          <LeagueSelectionPage
            allLeagues={allLeagues}
            isAllLeagueScope={isAllLeagueScope}
            isLeagueSelectionReady={isLeagueSelectionReady}
            isLeaguesLoading={isLeaguesLoading}
            leaguesError={leaguesError}
            selectedLeagueIds={selectedLeagueIds}
            onAddLeague={addLeagueToSelection}
            onRemoveLeague={removeLeagueFromSelection}
            onSelectRegion={selectRegionLeagues}
            onClose={closeLeagueSelector}
            requireSelection={!hasCompletedLeagueOnboarding && !leaguesError}
            maxSelectedLeagues={MAX_SELECTED_LEAGUES}
          />
        ) : null}

        {isFeedbackSheetOpen ? <QuickFeedbackSheet onClose={() => setIsFeedbackSheetOpen(false)} /> : null}
      </div>

      <MainDrawer
        isOpen={isMainMenuOpen}
        activeTab={activeTab}
        isDarkMode={isDarkMode}
        canInstall={canInstall}
        showShare={activeTab === 'home'}
        buildTime={APP_BUILD_TIME}
        commit={APP_COMMIT}
        onClose={() => setIsMainMenuOpen(false)}
        onSelectTab={(tab) => switchTab(tab, 'root')}
        onOpenAbout={openAbout}
        onInstall={triggerInstallPrompt}
        onShare={onShare}
        onThemeChange={setDarkMode}
      />

      <ShareSheet
        isOpen={isShareSheetOpen}
        links={shareLinks}
        onClose={() => setIsShareSheetOpen(false)}
      />
    </>
  );
}

export default App;