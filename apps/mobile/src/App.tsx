import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import './app-shell.css';
import { H2HTabContent } from './H2HTabContent';
import { HomeTabContent } from './HomeTabContent';
import { LeagueSelectionPage } from './LeagueSelectionPage';
import { LeaguesTabContent } from './LeaguesTabContent';
import { TabFooterBar } from './TabFooterBar';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useTabNavigation, type AppTabId } from './navigation/tab-navigation';
import { useLeaguesQuery, usePlayerSearchQuery } from './queries';
import { usePWAInstallContext } from './PWAInstallContext';

type MenuId = 'menu-main' | 'menu-share';
type MenuPlacement = 'left' | 'right' | 'top' | 'bottom';
type MenuEffect = 'none' | 'menu-push' | 'menu-parallax';

type MenuConfig = {
  effect: MenuEffect;
  height?: number;
  id: MenuId;
  placement: MenuPlacement;
  width?: number;
};

type PlayerSearchItem = {
  id: string;
  name: string;
  played: number;
  wins: number;
};

const tabTitles: Record<AppTabId, string> = {
  home: 'TTLive',
  players: 'Players',
  leagues: 'Leagues',
  h2h: 'H2H',
};

const menuConfigs: Record<MenuId, MenuConfig> = {
  'menu-main': { id: 'menu-main', placement: 'left', width: 280, effect: 'none' },
  'menu-share': { id: 'menu-share', placement: 'bottom', height: 370, effect: 'none' },
};

const HEADER_SWITCH_SCROLL = 40;
const SEARCH_DEBOUNCE_MS = 250;
const MAX_SELECTED_LEAGUES = 10;

const THEME_STORAGE_KEY = 'TTPlayers-Theme';
const FAVOURITES_STORAGE_KEY = 'tt_players_favourite_players';
const FAVOURITES_UPDATED_EVENT = 'tt_players_favourite_players_updated';
const LEAGUES_STORAGE_KEY = 'tt_players_selected_league_ids';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0] ?? 'P').slice(0, 2).toUpperCase();
}

function getWinRate(player: Pick<PlayerSearchItem, 'wins' | 'played'>): number {
  if (player.played <= 0) return 0;
  return Math.round((player.wins / player.played) * 100);
}

function isValidFavouritePlayer(value: unknown): value is PlayerSearchItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.played === 'number'
    && typeof item.wins === 'number';
}

function parseStoredFavouritePlayers(): PlayerSearchItem[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFavouritePlayer);
  } catch {
    return [];
  }
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

function persistFavouritePlayers(players: PlayerSearchItem[]) {
  localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(players));
  window.dispatchEvent(new Event(FAVOURITES_UPDATED_EVENT));
}


function InstallAppMenuItem({ onClose }: { onClose: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const { triggerInstallPrompt, canInstall } = usePWAInstallContext();

  if (!canInstall) return null;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClose(e);
    triggerInstallPrompt();
  };

  return (
    <a href="#" onClick={handleClick}>
      <i className="fa fa-download color-white" />
      <span>Install App</span>
      <i className="fa fa-angle-right" />
    </a>
  );
}

function App() {
  const { activeTab, handleSystemBack, navigateInActiveTab, switchTab } = useTabNavigation();
  const [activeMenuId, setActiveMenuId] = useState<MenuId | null>(null);
  const [favouritePlayers, setFavouritePlayers] = useState<PlayerSearchItem[]>(() => parseStoredFavouritePlayers());
  const [isBooting, setIsBooting] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLeagueSelectorOpen, setIsLeagueSelectorOpen] = useState(false);
  const [isLeagueSelectionReady, setIsLeagueSelectionReady] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);

  const headerRef = useRef<HTMLElement | null>(null);
  const pageTitleRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const normalizedDebouncedQuery = debouncedQuery.trim();
  const leaguesQuery = useLeaguesQuery();
  const allLeagues = useMemo(
    () => (Array.isArray(leaguesQuery.data?.data) ? leaguesQuery.data.data : []),
    [leaguesQuery.data],
  );
  const allLeagueIds = useMemo(() => allLeagues.map((league: { id: string }) => league.id), [allLeagues]);
  const isLeaguesLoading = leaguesQuery.isLoading;
  const leaguesError = leaguesQuery.error instanceof Error ? leaguesQuery.error.message : null;
  const isAllLeagueScope = selectedLeagueIds.length === 0
    || (allLeagues.length > 0 && selectedLeagueIds.length === allLeagues.length);
  const selectedLeagueNames = useMemo(() => {
    if (isAllLeagueScope) return allLeagues.map((league) => league.name);
    const leagueNameById = new Map(allLeagues.map((league: { id: string; name: string }) => [league.id, league.name]));
    return selectedLeagueIds
      .map((leagueId) => leagueNameById.get(leagueId))
      .filter((name): name is string => Boolean(name));
  }, [allLeagues, isAllLeagueScope, selectedLeagueIds]);
  const searchScopeLabel = useMemo(() => {
    if (isAllLeagueScope) return 'All leagues';
    if (selectedLeagueNames.length === 0) return `${selectedLeagueIds.length} selected`;
    if (selectedLeagueNames.length <= 2) return selectedLeagueNames.join(', ');
    return `${selectedLeagueNames.slice(0, 2).join(', ')} +${selectedLeagueNames.length - 2} more`;
  }, [isAllLeagueScope, selectedLeagueIds.length, selectedLeagueNames]);
  const selectedLeagueBadgeLabel = isAllLeagueScope ? 'All' : selectedLeagueIds.length;
  const isSearchMode = normalizedQuery.length > 2;
  const isShortSearchQuery = normalizedQuery.length > 0 && normalizedQuery.length <= 2;
  const shouldFetchPlayers = activeTab === 'players'
    && isLeagueSelectionReady
    && (normalizedDebouncedQuery.length === 0 || normalizedDebouncedQuery.length > 2);
  const playersSearchQuery = usePlayerSearchQuery(normalizedDebouncedQuery, selectedLeagueIds, {
    enabled: shouldFetchPlayers,
    allLeaguesCount: allLeagues.length,
  });
  const searchResults = playersSearchQuery.data?.data ?? [];
  const isSearchLoading = shouldFetchPlayers
    && (playersSearchQuery.isLoading || (playersSearchQuery.isFetching && !playersSearchQuery.data));
  const searchError = playersSearchQuery.error instanceof Error ? playersSearchQuery.error.message : null;
  const activeMenuConfig = activeMenuId ? menuConfigs[activeMenuId] : null;

  const wrapperTransform = useMemo(() => {
    if (!activeMenuConfig || activeMenuConfig.effect === 'none') {
      return undefined;
    }

    const multiplier = activeMenuConfig.effect === 'menu-push' ? 1 : 0.1;

    if (activeMenuConfig.placement === 'left') {
      return `translateX(${(activeMenuConfig.width ?? 0) * multiplier}px)`;
    }
    if (activeMenuConfig.placement === 'right') {
      return `translateX(-${(activeMenuConfig.width ?? 0) * multiplier}px)`;
    }
    if (activeMenuConfig.placement === 'top') {
      return `translateY(${(activeMenuConfig.height ?? 0) * multiplier}px)`;
    }

    return `translateY(-${(activeMenuConfig.height ?? 0) * multiplier}px)`;
  }, [activeMenuConfig]);

  const wrapperStyle: CSSProperties | undefined = wrapperTransform
    ? { transform: wrapperTransform }
    : undefined;

  const openActiveMenu = (menuId: MenuId) => setActiveMenuId(menuId);
  const closeActiveMenu = () => setActiveMenuId(null);
  const openLeagueSelector = () => {
    closeActiveMenu();
    setIsLeagueSelectorOpen(true);
  };
  const closeLeagueSelector = () => setIsLeagueSelectorOpen(false);

  const onMenuTrigger =
    (menuId: MenuId) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      openActiveMenu(menuId);
    };

  const onOpenLeagueSelector = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    openLeagueSelector();
  };

  const onCloseMenuClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    closeActiveMenu();
  };

  const onFooterTabClick =
    (tabId: AppTabId) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      closeLeagueSelector();
      closeActiveMenu();
      switchTab(tabId, 'root');
    };

  const onMenuTabClick =
    (tabId: AppTabId) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      closeLeagueSelector();
      closeActiveMenu();
      switchTab(tabId, 'root');
    };

  const onSystemBackPressed = useCallback((): boolean => {
    if (activeMenuId) {
      closeActiveMenu();
      return true;
    }

    if (isLeagueSelectorOpen) {
      closeLeagueSelector();
      return true;
    }

    return handleSystemBack();
  }, [activeMenuId, handleSystemBack, isLeagueSelectorOpen]);

  const activateDarkMode = () => {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light', 'detect-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark-mode');
    setIsDarkMode(true);
  };

  const activateLightMode = () => {
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark', 'detect-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'light-mode');
    setIsDarkMode(false);
  };

  const toggleTheme = (event: MouseEvent<HTMLAnchorElement | HTMLInputElement>): void => {
    event.preventDefault();
    if (document.body.classList.contains('theme-dark')) {
      activateLightMode();
      return;
    }
    activateDarkMode();
  };

  const isFavouritePlayer = (playerId: string) => (
    favouritePlayers.some((player) => player.id === playerId)
  );

  const toggleFavouritePlayer = (player: PlayerSearchItem) => {
    setFavouritePlayers((previous) => {
      const exists = previous.some((item) => item.id === player.id);
      const next = exists
        ? previous.filter((item) => item.id !== player.id)
        : [player, ...previous.filter((item) => item.id !== player.id)];
      persistFavouritePlayers(next);
      return next;
    });
  };

  const addLeagueToSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;

    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      const baseline = validPrevious.length === 0 ? allLeagueIds : validPrevious;
      if (baseline.includes(leagueId)) return baseline;
      if (baseline.length >= MAX_SELECTED_LEAGUES) return baseline;
      return [...baseline, leagueId];
    });
  };

  const removeLeagueFromSelection = (leagueId: string) => {
    if (!allLeagueIds.includes(leagueId)) return;

    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      const baseline = validPrevious.length === 0 ? allLeagueIds : validPrevious;
      const next = baseline.filter((id) => id !== leagueId);
      return next.length > 0 ? next : baseline;
    });
  };

  const selectRegionLeagues = (leagueIds: string[]) => {
    if (leagueIds.length === 0 || allLeagueIds.length === 0) return;

    setSelectedLeagueIds((previous) => {
      const validIdSet = new Set(allLeagueIds);
      const validPrevious = previous.filter((id) => validIdSet.has(id));
      const baseline = validPrevious.length === 0 ? allLeagueIds : validPrevious;
      if (baseline.length >= MAX_SELECTED_LEAGUES) return baseline;
      const nextSelected = new Set(baseline);

      for (const leagueId of leagueIds) {
        if (!validIdSet.has(leagueId)) continue;
        if (nextSelected.size >= MAX_SELECTED_LEAGUES) break;
        nextSelected.add(leagueId);
      }

      return allLeagueIds.filter((leagueId: string) => nextSelected.has(leagueId));
    });
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => setIsBooting(false), 350);
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    const rememberedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (rememberedTheme === 'dark-mode') {
      activateDarkMode();
    } else {
      activateLightMode();
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      setFavouritePlayers(parseStoredFavouritePlayers());
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(FAVOURITES_UPDATED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(FAVOURITES_UPDATED_EVENT, syncFromStorage);
    };
  }, []);

  useEffect(() => {
    if (isLeaguesLoading) return;

    if (leaguesError) {
      setSelectedLeagueIds([]);
      setIsLeagueSelectionReady(true);
      return;
    }

    const validLeagueIds = new Set(allLeagues.map((league: { id: string }) => league.id));
    const storedSelection = parseStoredLeagueIds().filter((id) => validLeagueIds.has(id));

    setSelectedLeagueIds((previous) => {
      const validPrevious = previous.filter((id) => validLeagueIds.has(id));
      if (validPrevious.length > 0) {
        return validPrevious.slice(0, MAX_SELECTED_LEAGUES);
      }
      return storedSelection.length > 0
        ? storedSelection.slice(0, MAX_SELECTED_LEAGUES)
        : allLeagues.slice(0, MAX_SELECTED_LEAGUES).map((league: { id: string }) => league.id);
    });

    setIsLeagueSelectionReady(true);
  }, [allLeagues, isLeaguesLoading, leaguesError]);

  useEffect(() => {
    if (!isLeagueSelectionReady) return;
    localStorage.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(selectedLeagueIds));
  }, [isLeagueSelectionReady, selectedLeagueIds]);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

      if (headerRef.current) {
        if (scrollTop >= HEADER_SWITCH_SCROLL) {
          headerRef.current.classList.add('header-active');
        } else {
          headerRef.current.classList.remove('header-active');
        }
      }

      if (pageTitleRef.current) {
        pageTitleRef.current.style.opacity = scrollTop >= HEADER_SWITCH_SCROLL ? '0' : '1';
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLeagueSelector();
        closeActiveMenu();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    type CapacitorGlobal = {
      Capacitor?: {
        App?: CapacitorAppPlugin;
        Plugins?: { App?: CapacitorAppPlugin };
      };
    };

    const capacitorGlobal = window as Window & CapacitorGlobal;
    const appPlugin = capacitorGlobal.Capacitor?.Plugins?.App ?? capacitorGlobal.Capacitor?.App;
    if (!appPlugin?.addListener) return;

    let isActive = true;
    let listenerHandle: CapacitorListenerHandle | null = null;

    const handleBack = () => {
      const handled = onSystemBackPressed();
      if (!handled) {
        appPlugin.exitApp?.();
      }
    };

    Promise.resolve(appPlugin.addListener('backButton', handleBack))
      .then((handle) => {
        if (!isActive) {
          handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => {
        // Ignore plugin binding issues when not running in a Capacitor container.
      });

    return () => {
      isActive = false;
      listenerHandle?.remove();
    };
  }, [onSystemBackPressed]);

  const pageHref = encodeURIComponent(window.location.href);
  const pageTitle = encodeURIComponent(document.title || 'TT Players');

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${pageHref}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${pageHref}`,
    mail: `mailto:?subject=${pageTitle}&body=${pageHref}`,
    twitter: `https://twitter.com/intent/tweet?url=${pageHref}&text=${pageTitle}`,
    whatsapp: `https://wa.me/?text=${pageTitle}%20${pageHref}`,
  };

  const listItems = normalizedQuery.length === 0 ? searchResults.slice(1) : searchResults;

  return (
    <>
      {isBooting ? (
        <div id="preloader">
          <div className="spinner-border color-highlight" role="status" />
        </div>
      ) : null}

      <div
        className={`menu-hider ${activeMenuId ? 'menu-active' : ''}`}
        onClick={closeActiveMenu}
        aria-hidden={activeMenuId ? undefined : true}
      />

        <div id="page" className="app-shell-page">
          {!isLeagueSelectorOpen ? (
            <>
        <header ref={headerRef} style={wrapperStyle} className="header header-auto-show header-fixed header-logo-center">
          <a href="#" className="header-title" onClick={onFooterTabClick(activeTab)}>TT Players</a>
          <a href="#" className="header-icon header-icon-1" data-menu="menu-main" onClick={onMenuTrigger('menu-main')}>
            <i className="fas fa-bars" />
          </a>
            <a
              href="#"
              className="header-icon header-icon-2 tt-header-league-filter"
              onClick={onOpenLeagueSelector}
              aria-label="Select leagues"
            >
              <i className="fas fa-filter" />
              <span className="tt-page-league-count">{selectedLeagueBadgeLabel}</span>
            </a>
          <a href="#" className="header-icon header-icon-3" data-menu="menu-share" onClick={onMenuTrigger('menu-share')}>
            <i className="fas fa-share-alt" />
          </a>
          <a href="#" className="header-icon header-icon-4 show-on-theme-dark" data-toggle-theme onClick={toggleTheme}>
            <i className="fas fa-sun" />
          </a>
          <a href="#" className="header-icon header-icon-4 show-on-theme-light" data-toggle-theme onClick={toggleTheme}>
            <i className="fas fa-moon" />
          </a>
        </header>

        {!isLeagueSelectorOpen ? <TabFooterBar reselectBehavior="root" /> : null}

          <>
            <div ref={pageTitleRef} className="page-title page-title-fixed">
              <h1>{tabTitles[activeTab]}</h1>
              <a href="#" className="page-title-icon bg-theme color-theme" data-menu="menu-share" onClick={onMenuTrigger('menu-share')}>
                <i className="fa fa-share-alt" />
              </a>
              <a
                href="#"
                className="page-title-icon bg-theme color-theme tt-page-league-filter"
                onClick={onOpenLeagueSelector}
                aria-label="Select leagues"
              >
                <i className="fa fa-filter" />
                <span className="tt-page-league-count">{selectedLeagueBadgeLabel}</span>
              </a>
              <a href="#" className="page-title-icon bg-theme color-theme show-on-theme-light" data-toggle-theme onClick={toggleTheme}>
                <i className="fa fa-moon" />
              </a>
              <a href="#" className="page-title-icon bg-theme color-theme show-on-theme-dark" data-toggle-theme onClick={toggleTheme}>
                <i className="fa fa-lightbulb color-yellow-dark" />
              </a>
              <a href="#" className="page-title-icon bg-theme color-theme" data-menu="menu-main" onClick={onMenuTrigger('menu-main')}>
                <i className="fa fa-bars" />
              </a>
            </div>
            <div className="page-title-clear" />
          </>
          </>
        ) : null}

        <main className="page-content mt-n1 app-shell-content" style={wrapperStyle}>
          {activeTab === 'home' ? (
            <HomeTabContent
              allLeagues={allLeagues}
              selectedLeagueIds={selectedLeagueIds}
              onOpenTab={(tabId) => switchTab(tabId, 'root')}
            />
          ) : null}

          {activeTab === 'players' ? (
            <>
              <section className="tt-players-search-panel" aria-label="Player search">
                <div className="tt-players-search-top">
                  <div>
                    <p className="tt-player-eyebrow">Players</p>
                    <h1 className="tt-players-search-title">Find a player</h1>
                  </div>
                  <button
                    type="button"
                    className="tt-players-filter-button"
                    onClick={(event) => {
                      event.preventDefault();
                      openLeagueSelector();
                    }}
                    aria-label="Select leagues"
                  >
                    <i className="fa fa-filter" />
                    <span>{selectedLeagueBadgeLabel}</span>
                  </button>
                </div>

                <label className="tt-players-search-input">
                  <i className="fa fa-search" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <p className="tt-players-search-scope">
                  Search scope: <strong>{searchScopeLabel}</strong>
                </p>
              </section>

              {favouritePlayers.length > 0 ? (
                <section className="tt-player-section" aria-labelledby="tt-favourite-players-title">
                  <div className="tt-player-section-header">
                    <h2 id="tt-favourite-players-title" className="tt-player-section-title">Favourite Players</h2>
                    <span className="tt-player-section-note">{favouritePlayers.length} saved</span>
                  </div>
                  <div className="favourites-scroll">
                    <div className="list-group list-custom-large tt-player-large-list tt-players-list">
                    {favouritePlayers.map((player) => (
                      <div
                        key={player.id}
                        className="tt-players-row"
                      >
                        <a
                          href="#"
                          className="tt-players-row-main"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateInActiveTab(`player/${player.id}`);
                          }}
                        >
                          <span className="tt-player-avatar bg-highlight color-white">{getInitials(player.name)}</span>
                          <span>{player.name}</span>
                          <strong>{getWinRate(player)}% WR • {player.played} matches</strong>
                        </a>
                        <button
                          type="button"
                          className="tt-player-remove-badge"
                          aria-label={`Remove ${player.name} from favourites`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFavouritePlayer(player);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {favouritePlayers.length === 0 && !isSearchMode && !isShortSearchQuery ? (
                <section className="tt-player-section tt-players-empty-section" aria-labelledby="tt-players-empty-title">
                  <div className="tt-player-section-header">
                    <h2 id="tt-players-empty-title" className="tt-player-section-title">Search by name</h2>
                    <span className="tt-player-section-note">3+ characters</span>
                  </div>
                  <p className="tt-player-section-state">
                    Search within the selected leagues, then save players here for quicker access.
                  </p>
                </section>
              ) : null}

              {isSearchMode || isShortSearchQuery ? (
                <section className="tt-player-section" aria-labelledby="tt-search-results-title">
                  <div className="tt-player-section-header">
                    <h2 id="tt-search-results-title" className="tt-player-section-title">Search Results</h2>
                    <span className="tt-player-section-note">{listItems.length} players</span>
                  </div>
                    {!isLeagueSelectionReady || isLeaguesLoading ? (
                      <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading leagues...</p>
                    ) : leaguesError ? (
                      <p className="tt-player-section-state tt-player-section-error">Failed to load leagues: {leaguesError}</p>
                    ) : normalizedQuery.length > 0 && normalizedQuery.length <= 2 ? (
                      <p className="tt-player-section-state">Type at least 3 characters to search players.</p>
                    ) : isSearchLoading ? (
                      <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading players...</p>
                    ) : searchError ? (
                      <p className="tt-player-section-state tt-player-section-error">Failed to load players: {searchError}</p>
                    ) : listItems.length === 0 ? (
                      <p className="tt-player-section-state">No players found matching "{normalizedQuery}"</p>
                    ) : (
                      <div className="list-group list-custom-large tt-player-large-list tt-player-search-list tt-players-list">
                        {listItems.map((player: PlayerSearchItem) => {
                          const isFavourite = isFavouritePlayer(player.id);
                          return (
                            <div
                              key={player.id}
                              data-filter-item
                              className="tt-players-row"
                            >
                              <a
                                href="#"
                                className="tt-players-row-main"
                                onClick={(event) => {
                                  event.preventDefault();
                                  navigateInActiveTab(`player/${player.id}`);
                                }}
                              >
                                <span className="tt-player-avatar bg-highlight color-white">{getInitials(player.name)}</span>
                                <span>{player.name}</span>
                                <strong>{getWinRate(player)}% WR • {player.played} matches</strong>
                              </a>
                              <button
                                type="button"
                                className={isFavourite ? 'tt-player-favourite-icon active' : 'tt-player-favourite-icon'}
                                aria-label={isFavourite ? 'Remove favourite' : 'Add favourite'}
                                onClick={() => {
                                  toggleFavouritePlayer(player);
                                }}
                              >
                                <i className="fa fa-heart" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === 'leagues' ? (
            <LeaguesTabContent
              selectedLeagueIds={selectedLeagueIds}
            />
          ) : null}

          {activeTab === 'h2h' ? (
            <H2HTabContent
              selectedLeagueIds={selectedLeagueIds}
              leagueScopeLabel={searchScopeLabel}
              onOpenPlayer={(playerId) => navigateInActiveTab(`player/${playerId}`)}
            />
          ) : null}
        </main>

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
            maxSelectedLeagues={MAX_SELECTED_LEAGUES}
          />
        ) : null}

        <div
          id="menu-main"
          className={`menu menu-box-left rounded-0 ${activeMenuId === 'menu-main' ? 'menu-active' : ''}`}
          data-menu-width={menuConfigs['menu-main'].width}
          style={{ width: menuConfigs['menu-main'].width }}
          aria-hidden={activeMenuId === 'menu-main' ? undefined : true}
        >
          <div className="card rounded-0 bg-highlight" data-card-height="140">
            <div className="card-top">
              <a href="#" className="close-menu float-end me-2 text-center mt-3 icon-40 notch-clear" onClick={onCloseMenuClick}>
                <i className="fa fa-times color-white" />
              </a>
            </div>
            <div className="card-bottom">
              <h1 className="color-white ps-3 mb-n1 font-28">TT Players</h1>
              <p className="mb-2 ps-3 font-12 color-white opacity-50">League Hub</p>
            </div>
          </div>

          <div className="mt-4" />
          <h6 className="menu-divider">Library</h6>
          <div className="list-group list-custom-small list-menu">
            <a href="#" onClick={onMenuTabClick('home')}>
              <i className="fa fa-home color-white" />
              <span>Home</span>
              <i className="fa fa-angle-right" />
            </a>
            <a href="#" onClick={onMenuTabClick('players')}>
              <i className="fa fa-user-friends color-white" />
              <span>Players</span>
              <i className="fa fa-angle-right" />
            </a>
            <a href="#" onClick={onMenuTabClick('leagues')}>
              <i className="fa fa-table-tennis color-white" />
              <span>Leagues</span>
              <i className="fa fa-angle-right" />
            </a>
            <a href="#" onClick={onMenuTabClick('h2h')}>
              <i className="fa fa-code-compare color-white" />
              <span>Head to Head</span>
              <i className="fa fa-angle-right" />
            </a>
          </div>

          <h6 className="menu-divider mt-4">Settings</h6>
          <div className="list-group list-custom-small list-menu">
            <a href="#" data-toggle-theme onClick={toggleTheme}>
              <i className="fa fa-moon color-white" />
              <span>Dark Mode</span>
              <div className="custom-control small-switch ios-switch">
                <input data-toggle-theme type="checkbox" className="ios-input" id="toggle-dark-menu" checked={isDarkMode} readOnly />
                <label className="custom-control-label" htmlFor="toggle-dark-menu" />
              </div>
            </a>
            <InstallAppMenuItem onClose={onCloseMenuClick} />
          </div>

          <h6 className="menu-divider mt-4">Links</h6>
          <div className="list-group list-custom-small list-menu">
            <a href="https://www.tournapilot.com/app" target="_blank" rel="noreferrer" onClick={onCloseMenuClick}>
              <i className="fa fa-external-link-alt color-white" />
              <span>TournaPilot</span>
              <i className="fa fa-angle-right" />
            </a>
          </div>
        </div>

        <div
          id="menu-share"
          className={`menu menu-box-bottom rounded-m ${activeMenuId === 'menu-share' ? 'menu-active' : ''}`}
          data-menu-height={menuConfigs['menu-share'].height}
          style={{ height: menuConfigs['menu-share'].height }}
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
              <a className="external-link" href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-facebook-f font-12 bg-facebook color-whiterounded-s" />
                <span>Facebook</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.twitter} target="_blank" rel="noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-twitter font-12 bg-twitter color-whiterounded-s" />
                <span>Twitter</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.linkedin} target="_blank" rel="noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-linkedin-in font-12 bg-linkedin color-whiterounded-s" />
                <span>LinkedIn</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={onCloseMenuClick}>
                <i className="fab fa-whatsapp font-12 bg-whatsapp color-whiterounded-s" />
                <span>WhatsApp</span>
                <i className="fa fa-angle-right pr-1" />
              </a>
              <a className="external-link border-0" href={shareLinks.mail} onClick={onCloseMenuClick}>
                <i className="fa fa-envelope font-12 bg-mail color-whiterounded-s" />
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
