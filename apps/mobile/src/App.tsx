import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import './app-shell.css';
import { H2HTabContent } from './H2HTabContent';
import { HomeTabContent } from './HomeTabContent';
import { LeagueSelectionPage } from './LeagueSelectionPage';
import { LeaguesTabContent } from './LeaguesTabContent';
import { EventsTabContent } from './EventsTabContent';
import { AboutTabContent } from './AboutTabContent';
import { QuickFeedbackSheet } from './QuickFeedbackSheet';
import { TabFooterBar } from './TabFooterBar';
import { SearchPanel } from './components/SearchPanel';
import { FavouriteButton } from './components/FavouriteButton';
import { useSearch } from './hooks/useSearch';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useTabNavigation, type AppTabId } from './navigation/tab-navigation';
import { useLeaguesQuery, usePlayerSearchQuery } from './queries';
import { usePWAInstallContext } from './PWAInstallContext';
import { useTheme, List, ListItem, Avatar, EmptyState } from './ui/appkit';
import { getQueryError, TAB_METADATA, type LeagueWithDivisions } from './player-shared';
import { buildHomeShareTarget, buildWebShareLinks, shareTarget } from './share-target';

type PlayerSearchScope = 'all' | 'selected';
type MenuId = 'menu-main' | 'menu-share';

const SEARCH_DEBOUNCE_MS = 250;
const MAX_SELECTED_LEAGUES = 15;
const HEADER_SWITCH_SCROLL = 40;

const LEAGUES_STORAGE_KEY = 'tt_players_selected_league_ids';
const LEAGUE_ONBOARDING_STORAGE_KEY = 'tt_players_league_onboarding_complete';
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

function InstallAppMenuItem({ onClose }: { onClose: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const { triggerInstallPrompt, canInstall } = usePWAInstallContext();
  if (!canInstall) return null;
  return (
    <a href="#" onClick={(e) => { onClose(e); triggerInstallPrompt(); }}>
      <i className="fa fa-download color-white" />
      <span>Install App</span>
      <i className="fa fa-angle-right" />
    </a>
  );
}

function App() {
  const { activeTab, handleSystemBack, navigateInActiveTab, switchTab } = useTabNavigation();
  const { players: favouritePlayers, isFavourite, toggle: toggleFavourite } = useFavouritePlayers();
  const { isDarkMode, toggleTheme } = useTheme();
  const { showAndroidSheet, showIosSheet, dismiss: dismissPWAInstall } = usePWAInstallContext();
  const headerRef = useRef<HTMLElement | null>(null);
  const pageTitleRef = useRef<HTMLDivElement | null>(null);

  const [activeMenuId, setActiveMenuId] = useState<MenuId | null>(null);
  const [isLeagueSelectorOpen, setIsLeagueSelectorOpen] = useState(false);
  const [isFeedbackSheetOpen, setIsFeedbackSheetOpen] = useState(false);
  const [isLeagueSelectionReady, setIsLeagueSelectionReady] = useState(false);
  const [hasCompletedLeagueOnboarding, setHasCompletedLeagueOnboarding] = useState(() => hasCompletedStoredLeagueOnboarding());
  const [playerSearchScope, setPlayerSearchScope] = useState<PlayerSearchScope>('all');
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);

  const search = useSearch({ minLength: 3, debounceMs: SEARCH_DEBOUNCE_MS, enabled: activeTab === 'players' });
  const { query, setQuery, normalizedQuery, debouncedQuery, isTooShort, isActive } = search;

  const leaguesQuery = useLeaguesQuery();
  const allLeagues: LeagueWithDivisions[] = useMemo(
    () => (Array.isArray(leaguesQuery.data?.data) ? leaguesQuery.data.data : []),
    [leaguesQuery.data],
  );
  const allLeagueIds = useMemo(() => allLeagues.map((l) => l.id), [allLeagues]);
  const isLeaguesLoading = leaguesQuery.isLoading;
  const leaguesError = getQueryError(leaguesQuery.error);

  const hasSelectedLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;
  const isAllLeagueScope = hasSelectedLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;
  const selectedLeagueBadgeLabel = !hasCompletedLeagueOnboarding ? 'Choose' : isAllLeagueScope ? 'All' : selectedLeagueIds.length;
  const playerSearchLeagueIds = playerSearchScope === 'selected' ? selectedLeagueIds : [];

  const shouldFetchPlayers = activeTab === 'players'
    && (debouncedQuery.length === 0 || debouncedQuery.length > 2);
  const playersSearchQuery = usePlayerSearchQuery(debouncedQuery, playerSearchLeagueIds, {
    enabled: shouldFetchPlayers,
    allLeaguesCount: allLeagues.length,
  });
  const searchResults = playersSearchQuery.data?.data ?? [];
  const isSearchLoading = shouldFetchPlayers
    && (playersSearchQuery.isLoading || (playersSearchQuery.isFetching && !playersSearchQuery.data));
  const searchError = getQueryError(playersSearchQuery.error);
  const listItems = normalizedQuery.length === 0 ? searchResults.slice(1) : searchResults;

  const openActiveMenu = (menuId: MenuId) => setActiveMenuId(menuId);
  const closeActiveMenu = () => setActiveMenuId(null);
  const openLeagueSelector = () => { closeActiveMenu(); setIsFeedbackSheetOpen(false); setIsLeagueSelectorOpen(true); };
  const closeLeagueSelector = () => {
    if (!hasCompletedLeagueOnboarding && selectedLeagueIds.length === 0 && !leaguesError) return;
    setIsLeagueSelectorOpen(false);
  };
  const openFeedbackSheet = (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); closeActiveMenu(); setIsFeedbackSheetOpen(true); };
  const closeFeedbackSheet = () => setIsFeedbackSheetOpen(false);

  const onMenuTrigger = (menuId: MenuId) => (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); openActiveMenu(menuId); };
  const onOpenLeagueSelector = (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); openLeagueSelector(); };
  const onCloseMenuClick = (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); closeActiveMenu(); };
  const onFooterTabClick = (tabId: AppTabId) => (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); closeLeagueSelector(); closeActiveMenu(); switchTab(tabId, 'root'); };
  const onMenuTabClick = (tabId: AppTabId) => (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); closeLeagueSelector(); closeActiveMenu(); switchTab(tabId, 'root'); };
  const onMenuEventsClick = (event: MouseEvent<HTMLAnchorElement>): void => { event.preventDefault(); closeLeagueSelector(); closeActiveMenu(); navigateInActiveTab('events'); };

  const onSystemBackPressed = useCallback((): boolean => {
    if (activeMenuId) { closeActiveMenu(); return true; }
    if (showAndroidSheet || showIosSheet) { dismissPWAInstall(); return true; }
    if (isFeedbackSheetOpen) { closeFeedbackSheet(); return true; }
    if (isLeagueSelectorOpen) { closeLeagueSelector(); return true; }
    return handleSystemBack();
  }, [activeMenuId, dismissPWAInstall, handleSystemBack, isFeedbackSheetOpen, isLeagueSelectorOpen, showAndroidSheet, showIosSheet]);

  const addLeagueToSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      const baseline = validPrevious.length === 0 ? [] : validPrevious;
      if (baseline.includes(leagueId)) return baseline;
      if (baseline.length >= MAX_SELECTED_LEAGUES) return baseline;
      return [...baseline, leagueId];
    });
    setHasCompletedLeagueOnboarding(true);
  };

  const removeLeagueFromSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      return validPrevious.filter((id) => id !== leagueId);
    });
  };

  const selectRegionLeagues = (leagueIds: string[]) => {
    if (leagueIds.length === 0 || allLeagueIds.length === 0) return;
    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      const baseline = validPrevious.length === 0 ? [] : validPrevious;
      if (baseline.length >= MAX_SELECTED_LEAGUES) return baseline;
      const nextSelected = new Set(baseline);
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
    if (isLeaguesLoading) return;
    if (leaguesError) {
      setSelectedLeagueIds([]);
      setIsLeagueSelectionReady(true);
      return;
    }
    const validLeagueIds = new Set(allLeagues.map((l) => l.id));
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
    if (hasCompletedLeagueOnboarding) localStorage.setItem(LEAGUE_ONBOARDING_STORAGE_KEY, 'true');
  }, [hasCompletedLeagueOnboarding, isLeagueSelectionReady, selectedLeagueIds]);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const isCompact = scrollTop >= HEADER_SWITCH_SCROLL;
      headerRef.current?.classList.toggle('header-active', isCompact);
      if (pageTitleRef.current) pageTitleRef.current.style.opacity = isCompact ? '0' : '1';
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeLeagueSelector(); closeActiveMenu(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onBackButton = (event: Event) => { event.preventDefault(); onSystemBackPressed(); };
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
    const handleBack = () => { const handled = onSystemBackPressed(); if (!handled) appPlugin.exitApp?.(); };
    Promise.resolve(appPlugin.addListener('backButton', handleBack))
      .then((handle) => { if (!isActive) { handle.remove(); return; } listenerHandle = handle; })
      .catch(() => { /* not in a Capacitor container */ });
    return () => { isActive = false; listenerHandle?.remove(); };
  }, [onSystemBackPressed]);

  const homeShareTarget = buildHomeShareTarget(window.location.origin);
  const shareLinks = buildWebShareLinks(homeShareTarget);
  const onShareClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    closeActiveMenu();
    if (typeof navigator.share === 'function') {
      await shareTarget(homeShareTarget);
      return;
    }
    setActiveMenuId('menu-share');
  };

  const menuTabs: AppTabId[] = ['home', 'players', 'leagues', 'events', 'h2h'];

  return (
    <>
      <div id="page" className="app-shell-page">
        {!isLeagueSelectorOpen ? (
          <>
            {/* Compact AppKit header: initially hidden by header-auto-show, activated after the page title scrolls away. */}
            <header ref={headerRef} className="header header-auto-show header-fixed header-logo-center" role="banner">
              <a href="#" className="header-title" onClick={onFooterTabClick(activeTab)}>{TAB_METADATA[activeTab].label}</a>
              <a href="#" className="header-icon header-icon-1" onClick={onMenuTrigger('menu-main')} aria-label="Open menu">
                <i className="fas fa-bars" />
              </a>
              <a href="#" className="header-icon header-icon-2 tt-header-league-filter" onClick={onOpenLeagueSelector} aria-label="Select leagues">
                <i className="fas fa-filter" />
                <span className="tt-page-league-count">{selectedLeagueBadgeLabel}</span>
              </a>
              <a href="#" className="header-icon header-icon-3" onClick={openFeedbackSheet} aria-label="Send feedback">
                <i className="fas fa-comment-dots" />
              </a>
              <a
                href="#"
                className="header-icon header-icon-4"
                onClick={(e) => { e.preventDefault(); toggleTheme(); }}
                aria-checked={isDarkMode}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                role="switch"
              >
                <i className={isDarkMode ? 'fas fa-sun' : 'fas fa-moon'} />
              </a>
            </header>

            <TabFooterBar reselectBehavior="root" />

            <div ref={pageTitleRef} className="page-title page-title-fixed">
              <h1>{TAB_METADATA[activeTab].label}</h1>
              <a href="#" className="page-title-icon bg-theme color-theme" onClick={openFeedbackSheet} aria-label="Send feedback">
                <i className="fa fa-comment-dots" />
              </a>
              {activeTab === 'home' ? (
                <a href="#" className="page-title-icon bg-theme color-theme" onClick={onShareClick} aria-label="Share TT Players">
                  <i className="fa fa-share-alt" />
                </a>
              ) : null}
              <a href="#" className="page-title-icon bg-theme color-theme tt-page-league-filter" onClick={onOpenLeagueSelector} aria-label="Select leagues">
                <i className="fa fa-filter" />
                <span className="tt-page-league-count">{selectedLeagueBadgeLabel}</span>
              </a>
              <a
                href="#"
                className="page-title-icon bg-theme color-theme"
                onClick={(e) => { e.preventDefault(); toggleTheme(); }}
                aria-checked={isDarkMode}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                role="switch"
              >
                <i className={isDarkMode ? 'fa fa-sun' : 'fa fa-moon'} />
              </a>
              <a href="#" className="page-title-icon bg-theme color-theme" onClick={onMenuTrigger('menu-main')} aria-label="Open menu">
                <i className="fa fa-bars" />
              </a>
            </div>
            <div className="page-title-clear" />

            <main className="page-content app-shell-content">
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
                <>
                  <SearchPanel
                    eyebrow="Players"
                    title="Find a player"
                    placeholder="Search players…"
                    query={query}
                    onQueryChange={setQuery}
                    scope={{
                      ariaLabel: 'Choose player search scope',
                      value: playerSearchScope,
                      onChange: (v) => setPlayerSearchScope(v as PlayerSearchScope),
                      options: [
                        { value: 'all', label: 'All leagues' },
                        { value: 'selected', label: 'Selected' },
                      ],
                    }}
                  >
                    <div aria-live="polite">
                      {favouritePlayers.length > 0 && !isActive && !isTooShort ? (
                        <section className="tt-player-section" aria-labelledby="tt-favourite-players-title">
                          <div className="tt-section-header">
                            <h2 id="tt-favourite-players-title" className="tt-section-header__title">Favourite Players</h2>
                            <span className="tt-section-header__note">{favouritePlayers.length} saved</span>
                          </div>
                          <List divider="hairline" size="lg">
                            {favouritePlayers.map((player) => (
                              <ListItem
                                key={player.id}
                                leading={<Avatar text={player.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()} />}
                                title={player.name}
                                subtitle={`${player.wins}W · ${player.played}P`}
                                onClick={() => navigateInActiveTab(`player/${player.id}`)}
                                trailing={<FavouriteButton size="icon" saved onToggle={() => toggleFavourite(player)} />}
                              />
                            ))}
                          </List>
                        </section>
                      ) : null}

                      {favouritePlayers.length === 0 && !isActive && !isTooShort ? (
                        <section className="tt-player-section">
                          <EmptyState
                            iconClassName="fa fa-search"
                            title="Search by name"
                            message="Search across all leagues, then save players here for quicker access."
                          />
                        </section>
                      ) : null}

                      {isActive || isTooShort ? (
                        <section className="tt-player-section" aria-labelledby="tt-search-results-title">
                          <div className="tt-section-header">
                            <h2 id="tt-search-results-title" className="tt-section-header__title">Search Results</h2>
                            <span className="tt-section-header__note">{listItems.length} players</span>
                          </div>
                          {isTooShort ? (
                            <EmptyState iconClassName="fa fa-keyboard" title="Type at least 3 characters" message="Then we'll search players for you." />
                          ) : isSearchLoading ? (
                            <EmptyState iconClassName="fa fa-spinner fa-spin" title="Searching…" />
                          ) : searchError ? (
                            <EmptyState iconClassName="fa fa-exclamation-triangle" title="Couldn’t load players" message={searchError} />
                          ) : listItems.length === 0 ? (
                            <EmptyState iconClassName="fa fa-search" title="No players found" message={`No players matching “${normalizedQuery}”.`} />
                          ) : (
                            <List divider="hairline" size="lg">
                              {listItems.map((player) => {
                                const saved = isFavourite(player.id);
                                return (
                                  <ListItem
                                    key={player.id}
                                    leading={<Avatar text={player.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()} />}
                                    title={player.name}
                                    subtitle={`${player.wins}W · ${player.played}P`}
                                    onClick={() => navigateInActiveTab(`player/${player.id}`)}
                                    trailing={<FavouriteButton saved={saved} onToggle={() => toggleFavourite(player)} />}
                                  />
                                );
                              })}
                            </List>
                          )}
                        </section>
                      ) : null}
                    </div>
                  </SearchPanel>
                </>
              ) : null}

              {activeTab === 'leagues' ? <LeaguesTabContent selectedLeagueIds={selectedLeagueIds} /> : null}
              {activeTab === 'h2h' ? <H2HTabContent onOpenPlayer={(playerId) => navigateInActiveTab(`player/${playerId}`)} /> : null}
              {activeTab === 'events' ? <EventsTabContent /> : null}
              {activeTab === 'about' ? <AboutTabContent /> : null}
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

        {isFeedbackSheetOpen ? <QuickFeedbackSheet onClose={closeFeedbackSheet} /> : null}
        {activeMenuId === 'menu-main' ? (
          <button
            type="button"
            className="tt-main-menu-backdrop"
            onClick={closeActiveMenu}
            aria-label="Close menu"
          />
        ) : null}

        {/* ── Main menu (driven by TAB_METADATA) ── */}
        <div
          id="menu-main"
          className={`menu menu-box-left rounded-0 tt-main-menu ${activeMenuId === 'menu-main' ? 'menu-active' : ''}`}
          style={{ width: 280 }}
          aria-hidden={activeMenuId === 'menu-main' ? undefined : true}
        >
          <div className="tt-main-menu-hero">
            <div className="tt-main-menu-hero-top">
              <a href="#" className="tt-main-menu-close" onClick={onCloseMenuClick} aria-label="Close menu">
                <i className="fa fa-times" />
              </a>
            </div>
            <div>
              <p className="tt-picker-eyebrow">Menu</p>
              <h1 className="tt-main-menu-title">TT Players</h1>
            </div>
          </div>

          <div className="mt-4" />
          <h6 className="menu-divider">Library</h6>
          <div className="list-group list-custom-small list-menu">
            {menuTabs.map((tabId) => {
              const meta = TAB_METADATA[tabId];
              return (
                <a
                  key={tabId}
                  href="#"
                  onClick={tabId === 'events' ? onMenuEventsClick : onMenuTabClick(tabId)}
                >
                  <i className={`${meta.icon} color-white`} />
                  <span>{meta.label}</span>
                  <i className="fa fa-angle-right" />
                </a>
              );
            })}
          </div>

          <h6 className="menu-divider mt-4">Settings</h6>
          <div className="list-group list-custom-small list-menu">
            <a href="#" onClick={(e) => { e.preventDefault(); toggleTheme(); }} role="switch" aria-checked={isDarkMode}>
              <i className="fa fa-moon color-white" />
              <span>Dark Mode</span>
              <div className="custom-control small-switch ios-switch">
                <input type="checkbox" className="ios-input" id="toggle-dark-menu" checked={isDarkMode} readOnly />
                <label className="custom-control-label" htmlFor="toggle-dark-menu" />
              </div>
            </a>
            <InstallAppMenuItem onClose={onCloseMenuClick} />
            <a href="#" onClick={onMenuTabClick('about')}>
              <i className={`${TAB_METADATA.about.icon} color-white`} />
              <span>{TAB_METADATA.about.label}</span>
              <i className="fa fa-angle-right" />
            </a>
          </div>

          <h6 className="menu-divider mt-4">Links</h6>
          <div className="list-group list-custom-small list-menu">
            {activeTab === 'home' ? (
              <a href="#" onClick={onShareClick}>
                <i className="fa fa-share-alt color-white" />
                <span>Share TT Players</span>
                <i className="fa fa-angle-right" />
              </a>
            ) : null}
            <a href="https://www.tournapilot.com/app" target="_blank" rel="noopener noreferrer" onClick={onCloseMenuClick}>
              <i className="fa fa-external-link-alt color-white" />
              <span>TournaPilot</span>
              <i className="fa fa-angle-right" />
            </a>
          </div>

          <div className="tt-main-menu-build" aria-label={`Build ${APP_BUILD_TIME}, commit ${APP_COMMIT}`}>
            <span>Built {APP_BUILD_TIME}</span>
            <span>Commit {APP_COMMIT}</span>
          </div>
        </div>

        <div
          id="menu-share"
          className={`menu menu-box-bottom rounded-m ${activeMenuId === 'menu-share' ? 'menu-active' : ''}`}
          style={{ height: 370 }}
          aria-hidden={activeMenuId === 'menu-share' ? undefined : true}
        >
          <div className="menu-title">
            <p className="color-highlight">Tap a link to</p>
            <h1>Share</h1>
            <a href="#" className="close-menu" onClick={onCloseMenuClick}><i className="fa fa-times-circle" /></a>
          </div>
          <div className="divider divider-margins mt-3 mb-0" />
          <div className="content mt-0">
            <div className="list-group list-custom-small list-icon-0">
              <a className="external-link" href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-facebook-f font-12 bg-facebook color-white rounded-s" />
                <span>Facebook</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.twitter} target="_blank" rel="noopener noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-twitter font-12 bg-twitter color-white rounded-s" />
                <span>Twitter</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.linkedin} target="_blank" rel="noopener noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-linkedin-in font-12 bg-linkedin color-white rounded-s" />
                <span>LinkedIn</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-whatsapp font-12 bg-whatsapp color-white rounded-s" />
                <span>WhatsApp</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link border-0" href={shareLinks.mail} onClick={onCloseMenuClick}>
                <i className="fa fa-envelope font-12 bg-mail color-white rounded-s" />
                <span>Email</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
