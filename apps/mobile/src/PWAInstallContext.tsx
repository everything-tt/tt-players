import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallContextValue {
  showAndroidSheet: boolean;
  showIosSheet: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
  triggerInstallPrompt: () => void;
  canInstall: boolean;
  isIOS: boolean;
}

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [isIOS] = useState(() =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || now - parseInt(lastPrompt) > 1000 * 60 * 60 * 24 * 7) {
        setShowAndroidSheet(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS check on mount
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isIOS && !isPWA) {
      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || now - parseInt(lastPrompt) > 1000 * 60 * 60 * 24 * 7) {
        setShowIosSheet(true);
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isIOS]);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowAndroidSheet(false);
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowAndroidSheet(false);
    setShowIosSheet(false);
  }, []);

  const triggerInstallPrompt = useCallback(() => {
    // Clear the dismissed state so we can show the prompt again
    localStorage.removeItem('pwa-install-dismissed');
    if (isIOS) {
      setShowIosSheet(true);
    } else {
      setShowAndroidSheet(true);
    }
  }, [isIOS]);

  return (
    <PWAInstallContext.Provider
      value={{
        showAndroidSheet,
        showIosSheet,
        install,
        dismiss,
        triggerInstallPrompt,
        canInstall: !!deferredPrompt || isIOS,
        isIOS,
      }}
    >
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstallContext(): PWAInstallContextValue {
  const ctx = useContext(PWAInstallContext);
  if (!ctx) throw new Error('usePWAInstallContext must be used within PWAInstallProvider');
  return ctx;
}
