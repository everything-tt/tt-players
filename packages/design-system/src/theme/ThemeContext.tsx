import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: (event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  activateDarkMode: () => void;
  activateLightMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'TTPlayers-Theme';
const LIGHT_THEME_COLOR = '#f1f8f2';
const DARK_THEME_COLOR = '#17382f';

function canUseDOM() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function persistTheme(storageKey: string, value: 'dark-mode' | 'light-mode') {
  if (!canUseDOM()) return;
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}

function syncThemeColor(isDarkMode: boolean) {
  if (!canUseDOM()) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', isDarkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
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
    return document.body.classList.contains('theme-dark') || defaultDark;
  });

  const activateDarkMode = () => {
    if (!canUseDOM()) return;
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light', 'detect-theme');
    persistTheme(storageKey, 'dark-mode');
    syncThemeColor(true);
    setIsDarkMode(true);
  };

  const activateLightMode = () => {
    if (!canUseDOM()) return;
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark', 'detect-theme');
    persistTheme(storageKey, 'light-mode');
    syncThemeColor(false);
    setIsDarkMode(false);
  };

  const toggleTheme = (
    event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
  ): void => {
    if (event && 'preventDefault' in event) {
      event.preventDefault();
    }
    if (!canUseDOM()) return;
    if (document.body.classList.contains('theme-dark')) {
      activateLightMode();
    } else {
      activateDarkMode();
    }
  };

  useEffect(() => {
    if (!canUseDOM()) return;
    const nextDarkMode = document.body.classList.contains('theme-dark');
    syncThemeColor(nextDarkMode);
    setIsDarkMode(nextDarkMode);
  }, []);

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
