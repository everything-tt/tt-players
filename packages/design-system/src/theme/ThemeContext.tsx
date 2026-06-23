import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: (event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  activateDarkMode: () => void;
  activateLightMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'TTPlayers-Theme';

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
    setIsDarkMode(true);
  };

  const activateLightMode = () => {
    if (!canUseDOM()) return;
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark', 'detect-theme');
    persistTheme(storageKey, 'light-mode');
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
    setIsDarkMode(document.body.classList.contains('theme-dark'));
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
