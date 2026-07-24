import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

export const APP_TABS = ['home', 'players', 'leagues', 'events', 'h2h', 'about'] as const;
export type AppTabId = (typeof APP_TABS)[number];

type TabStacks = Record<AppTabId, string[]>;
type ScrollPositions = Record<string, number>;
type ReselectBehavior = 'noop' | 'root';

const TAB_STACKS_STORAGE_KEY = 'tt_players_mobile_tab_stacks_v1';
const SCROLL_POSITIONS_STORAGE_KEY = 'tt_players_mobile_scroll_positions_v1';
const SCROLL_PERSIST_DEBOUNCE_MS = 150;
const DEFAULT_TAB: AppTabId = 'home';

type TabNavigationContextValue = {
  activeTab: AppTabId;
  buildTabPath: (tab: AppTabId, relativePath?: string) => string;
  canGoBackInActiveTab: boolean;
  goBackInActiveTab: (fallbackRelativePath?: string) => void;
  handleSystemBack: () => boolean;
  navigateInActiveTab: (relativePath?: string) => void;
  navigateInTab: (tab: AppTabId, relativePath?: string) => void;
  switchTab: (tab: AppTabId, reselectBehavior?: ReselectBehavior) => void;
};

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null);

export function isAppTab(value: string): value is AppTabId {
  return (APP_TABS as readonly string[]).includes(value);
}

function getDefaultStacks(): TabStacks {
  return {
    home: ['/tabs/home'],
    players: ['/tabs/players'],
    leagues: ['/tabs/leagues'],
    h2h: ['/tabs/h2h'],
    events: ['/tabs/events'],
    about: ['/tabs/about'],
  };
}

function parseActiveTab(pathname: string): AppTabId {
  const matched = pathname.match(/^\/tabs\/([^/]+)(?:\/|$)/);
  const maybeTab = matched?.[1];
  return maybeTab && isAppTab(maybeTab) ? maybeTab : DEFAULT_TAB;
}

function loadStacksFromStorage(): TabStacks {
  try {
    const raw = sessionStorage.getItem(TAB_STACKS_STORAGE_KEY);
    if (!raw) return getDefaultStacks();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return getDefaultStacks();

    const next = { ...getDefaultStacks() };
    for (const tab of APP_TABS) {
      const value = (parsed as Record<string, unknown>)[tab];
      if (!Array.isArray(value)) continue;
      const cleaned = value.filter(
        (item): item is string => typeof item === 'string' && item.startsWith('/tabs/'),
      );
      if (cleaned.length > 0) next[tab] = cleaned;
    }
    return next;
  } catch {
    return getDefaultStacks();
  }
}

function persistStacks(stacks: TabStacks): void {
  try {
    sessionStorage.setItem(TAB_STACKS_STORAGE_KEY, JSON.stringify(stacks));
  } catch {
    // Session storage can be unavailable in embedded or private contexts.
  }
}

function loadScrollPositionsFromStorage(): ScrollPositions {
  try {
    const raw = sessionStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const result: ScrollPositions = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function persistScrollPositions(scrollPositions: ScrollPositions): void {
  try {
    sessionStorage.setItem(SCROLL_POSITIONS_STORAGE_KEY, JSON.stringify(scrollPositions));
  } catch {
    // Session storage can be unavailable in embedded or private contexts.
  }
}

function buildTabPath(tab: AppTabId, relativePath = ''): string {
  const cleanPath = relativePath.replace(/^\/+/, '');
  return cleanPath ? `/tabs/${tab}/${cleanPath}` : `/tabs/${tab}`;
}

function nextStackForLocation(
  currentStack: string[],
  fullPath: string,
  navigationType: 'POP' | 'PUSH' | 'REPLACE',
): string[] {
  const stack = currentStack.length > 0 ? currentStack : [fullPath];
  const top = stack[stack.length - 1];

  if (navigationType === 'PUSH') {
    return top === fullPath ? stack : [...stack, fullPath];
  }

  if (navigationType === 'REPLACE') {
    return [...stack.slice(0, -1), fullPath];
  }

  const existingIndex = stack.lastIndexOf(fullPath);
  if (existingIndex >= 0) return stack.slice(0, existingIndex + 1);
  return top === fullPath ? stack : [...stack, fullPath];
}

export function TabNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const fullPath = `${location.pathname}${location.search}${location.hash}`;
  const activeTab = useMemo(() => parseActiveTab(location.pathname), [location.pathname]);
  const [tabStacks, setTabStacks] = useState<TabStacks>(() => loadStacksFromStorage());
  const scrollPositionsRef = useRef<ScrollPositions>(loadScrollPositionsFromStorage());
  const scrollPersistTimerRef = useRef<number | null>(null);

  const scheduleScrollPersist = useCallback(() => {
    if (scrollPersistTimerRef.current !== null) return;
    scrollPersistTimerRef.current = window.setTimeout(() => {
      scrollPersistTimerRef.current = null;
      persistScrollPositions(scrollPositionsRef.current);
    }, SCROLL_PERSIST_DEBOUNCE_MS);
  }, []);

  const saveScrollPositionForCurrentPath = useCallback(() => {
    if (!location.pathname.startsWith('/tabs/')) return;
    scrollPositionsRef.current[fullPath] = Math.max(window.scrollY || window.pageYOffset || 0, 0);
    scheduleScrollPersist();
  }, [fullPath, location.pathname, scheduleScrollPersist]);

  useEffect(() => {
    if (!location.pathname.startsWith('/tabs/')) return;
    setTabStacks((previous) => {
      const previousStack = previous[activeTab] ?? [buildTabPath(activeTab)];
      const next = {
        ...previous,
        [activeTab]: nextStackForLocation(previousStack, fullPath, navigationType),
      };
      persistStacks(next);
      return next;
    });
  }, [activeTab, fullPath, location.pathname, navigationType]);

  useEffect(() => {
    if (!location.pathname.startsWith('/tabs/')) return;
    const onScroll = () => saveScrollPositionForCurrentPath();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      saveScrollPositionForCurrentPath();
    };
  }, [location.pathname, saveScrollPositionForCurrentPath]);

  useEffect(() => {
    if (!location.pathname.startsWith('/tabs/')) return;
    const savedScrollY = scrollPositionsRef.current[fullPath] ?? 0;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      window.scrollTo({ top: savedScrollY, left: 0, behavior: 'auto' });
      attempts += 1;
      if (attempts < 4 && Math.abs(window.scrollY - savedScrollY) > 1) {
        frame = window.requestAnimationFrame(restore);
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [fullPath, location.pathname]);

  useEffect(() => () => {
    if (scrollPersistTimerRef.current !== null) {
      window.clearTimeout(scrollPersistTimerRef.current);
      scrollPersistTimerRef.current = null;
    }
    persistScrollPositions(scrollPositionsRef.current);
  }, []);

  const switchTab = useCallback((tab: AppTabId, reselectBehavior: ReselectBehavior = 'noop') => {
    saveScrollPositionForCurrentPath();
    const tabRoot = buildTabPath(tab);

    if (tab === activeTab) {
      if (reselectBehavior === 'root') {
        const next = { ...tabStacks, [tab]: [tabRoot] };
        setTabStacks(next);
        persistStacks(next);
        scrollPositionsRef.current[tabRoot] = 0;
        navigate(tabRoot, { replace: true });
      }
      return;
    }

    const stack = tabStacks[tab];
    const targetPath = stack && stack.length > 0 ? stack[stack.length - 1] : tabRoot;
    navigate(targetPath, { replace: true });
  }, [activeTab, navigate, saveScrollPositionForCurrentPath, tabStacks]);

  const navigateInActiveTab = useCallback((relativePath = '') => {
    saveScrollPositionForCurrentPath();
    navigate(buildTabPath(activeTab, relativePath));
  }, [activeTab, navigate, saveScrollPositionForCurrentPath]);

  const navigateInTab = useCallback((tab: AppTabId, relativePath = '') => {
    saveScrollPositionForCurrentPath();
    navigate(buildTabPath(tab, relativePath));
  }, [navigate, saveScrollPositionForCurrentPath]);

  const goBackInActiveTab = useCallback((fallbackRelativePath = '') => {
    saveScrollPositionForCurrentPath();
    const stack = tabStacks[activeTab] ?? [buildTabPath(activeTab)];
    if (stack.length > 1) {
      const previousPath = stack[stack.length - 2];
      const next = { ...tabStacks, [activeTab]: stack.slice(0, -1) };
      setTabStacks(next);
      persistStacks(next);
      navigate(previousPath, { replace: true });
      return;
    }
    navigate(buildTabPath(activeTab, fallbackRelativePath), { replace: true });
  }, [activeTab, navigate, saveScrollPositionForCurrentPath, tabStacks]);

  const canGoBackInActiveTab = (tabStacks[activeTab]?.length ?? 0) > 1;

  const handleSystemBack = useCallback(() => {
    if (canGoBackInActiveTab) {
      goBackInActiveTab();
      return true;
    }
    if (activeTab !== DEFAULT_TAB) {
      switchTab(DEFAULT_TAB, 'root');
      return true;
    }
    return false;
  }, [activeTab, canGoBackInActiveTab, goBackInActiveTab, switchTab]);

  const value = useMemo<TabNavigationContextValue>(() => ({
    activeTab,
    buildTabPath,
    canGoBackInActiveTab,
    goBackInActiveTab,
    handleSystemBack,
    navigateInActiveTab,
    navigateInTab,
    switchTab,
  }), [activeTab, canGoBackInActiveTab, goBackInActiveTab, handleSystemBack, navigateInActiveTab, navigateInTab, switchTab]);

  return (
    <TabNavigationContext.Provider value={value}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation(): TabNavigationContextValue {
  const context = useContext(TabNavigationContext);
  if (!context) {
    throw new Error('useTabNavigation must be used within TabNavigationProvider');
  }
  return context;
}
