import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: (event?: React.MouseEvent<HTMLAnchorElement | HTMLInputElement> | React.ChangeEvent<HTMLInputElement>) => void;
  activateDarkMode: () => void;
  activateLightMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'TTPlayers-Theme';

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
  const [isDarkMode, setIsDarkMode] = useState(defaultDark);

  const activateDarkMode = () => {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light', 'detect-theme');
    localStorage.setItem(storageKey, 'dark-mode');
    setIsDarkMode(true);
  };

  const activateLightMode = () => {
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark', 'detect-theme');
    localStorage.setItem(storageKey, 'light-mode');
    setIsDarkMode(false);
  };

  const toggleTheme = (
    event?: React.MouseEvent<HTMLAnchorElement | HTMLInputElement> | React.ChangeEvent<HTMLInputElement>
  ): void => {
    if (event && 'preventDefault' in event) {
      event.preventDefault();
    }
    if (document.body.classList.contains('theme-dark')) {
      activateLightMode();
    } else {
      activateDarkMode();
    }
  };

  useEffect(() => {
    const rememberedTheme = localStorage.getItem(storageKey);
    if (rememberedTheme === 'dark-mode') {
      activateDarkMode();
    } else if (rememberedTheme === 'light-mode') {
      activateLightMode();
    } else {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemPrefersDark || defaultDark) {
        activateDarkMode();
      } else {
        activateLightMode();
      }
    }
  }, [storageKey, defaultDark]);

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
