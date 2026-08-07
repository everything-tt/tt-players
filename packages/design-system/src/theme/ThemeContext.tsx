import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: (event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  activateDarkMode: () => void;
  activateLightMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'TTPlayers-Theme';
const USER_DATA_CHANGED_EVENT = 'tt-players:user-data-changed';
const LIGHT_THEME_COLOR = '#f1f8f2';
const DARK_THEME_COLOR = '#17382f';

function canUseDOM() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readStoredTheme(storageKey: string): boolean | null {
  if (!canUseDOM()) return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === 'dark-mode') return true;
    if (value === 'light-mode') return false;
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
  return null;
}

function persistTheme(storageKey: string, value: 'dark-mode' | 'light-mode') {
  if (!canUseDOM()) return;
  try {
    window.localStorage.setItem(storageKey, value);
    window.dispatchEvent(new Event(USER_DATA_CHANGED_EVENT));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}

function syncThemeColor(isDarkMode: boolean) {
  if (!canUseDOM()) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', isDarkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

function applyThemeClasses(isDarkMode: boolean) {
  if (!canUseDOM()) return;
  document.body.classList.add(isDarkMode ? 'theme-dark' : 'theme-light');
  document.body.classList.remove(isDarkMode ? 'theme-light' : 'theme-dark', 'detect-theme');
  syncThemeColor(isDarkMode);
}

export interface ThemeProviderProps {
  children: ReactNode;
  storageKey?: string;
  defaultDark?: boolean;
}

export function ThemeProvider({
  children,
  storageKey = THEME_STORAGE_KEY,
  defaultDark = false,
}: ThemeProviderProps) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (!canUseDOM()) return defaultDark;
    return readStoredTheme(storageKey)
      ?? document.body.classList.contains('theme-dark')
      ?? defaultDark;
  });

  const applyTheme = (nextDarkMode: boolean, persist: boolean) => {
    if (!canUseDOM()) return;
    applyThemeClasses(nextDarkMode);
    if (persist) persistTheme(storageKey, nextDarkMode ? 'dark-mode' : 'light-mode');
    setIsDarkMode(nextDarkMode);
  };

  const activateDarkMode = () => applyTheme(true, true);
  const activateLightMode = () => applyTheme(false, true);

  const toggleTheme = (
    event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
  ): void => {
    if (event && 'preventDefault' in event) {
      event.preventDefault();
    }
    if (!canUseDOM()) return;
    applyTheme(!isDarkMode, true);
  };

  useEffect(() => {
    if (!canUseDOM()) return;

    const syncFromStorage = () => {
      const stored = readStoredTheme(storageKey);
      const nextDarkMode = stored
        ?? document.body.classList.contains('theme-dark')
        ?? defaultDark;
      applyThemeClasses(nextDarkMode);
      setIsDarkMode(nextDarkMode);
    };

    syncFromStorage();
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, [defaultDark, storageKey]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, activateDarkMode, activateLightMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
