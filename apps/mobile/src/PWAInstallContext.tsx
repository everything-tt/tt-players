import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { backupLocalData, requestPersistentStorage } from './local-persistence';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

interface PWAInstallContextValue {
  showAndroidSheet: boolean;
  showIosSheet: boolean;
  showUpdateSheet: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
  triggerInstallPrompt: () => void;
  updateApp: () => Promise<void>;
  dismissUpdate: () => void;
  canInstall: boolean;
  canUpdate: boolean;
  isIOS: boolean;
}

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode);
  const [isIOS] = useState(() =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
  );
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // Registered successfully.
    },
    onRegisterError() {
      // Ignore registration errors in the UI; the app still works without SW.
    },
  });

  useEffect(() => {
    if (needRefresh) setShowUpdateSheet(true);
  }, [needRefresh]);

  useEffect(() => {
    const installPromptHandler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);

      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || now - parseInt(lastPrompt, 10) > 1000 * 60 * 60 * 24 * 7) {
        setShowAndroidSheet(true);
      }
    };
    const installedHandler = () => {
      setDeferredPrompt(null);
      setShowAndroidSheet(false);
      setShowIosSheet(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', installPromptHandler);
    window.addEventListener('appinstalled', installedHandler);

    if (isIOS && !isStandalone) {
      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || now - parseInt(lastPrompt, 10) > 1000 * 60 * 60 * 24 * 7) {
        setShowIosSheet(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', installPromptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isIOS, isStandalone]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowAndroidSheet(false);
    if (choice.outcome === 'accepted') setIsStandalone(true);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowAndroidSheet(false);
    setShowIosSheet(false);
  }, []);

  const triggerInstallPrompt = useCallback(() => {
    if (isStandalone) return;
    localStorage.removeItem('pwa-install-dismissed');
    if (isIOS) {
      setShowIosSheet(true);
    } else if (deferredPrompt) {
      setShowAndroidSheet(true);
    }
  }, [deferredPrompt, isIOS, isStandalone]);

  const updateApp = useCallback(async () => {
    backupLocalData();
    await requestPersistentStorage();
    await updateServiceWorker(true);
  }, [updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setShowUpdateSheet(false);
  }, []);

  const canInstall = !isStandalone && (Boolean(deferredPrompt) || isIOS);

  return (
    <PWAInstallContext.Provider
      value={{
        showAndroidSheet,
        showIosSheet,
        showUpdateSheet,
        install,
        dismiss,
        triggerInstallPrompt,
        updateApp,
        dismissUpdate,
        canInstall,
        canUpdate: needRefresh,
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
