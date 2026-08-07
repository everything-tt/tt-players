import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  DEFAULT_INSTALL_PROMPT_COOLDOWN_MS,
  DEFAULT_INSTALL_PROMPT_STORAGE_KEY,
  isInstallPromptDue,
  isIOSUserAgent,
} from './install-policy';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PWAInstallContextValue {
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

export interface PWAInstallProviderProps {
  children: ReactNode;
  promptStorageKey?: string;
  promptCooldownMs?: number;
  onBeforeUpdate?: () => void | Promise<void>;
  persistStorageBeforeUpdate?: boolean;
  onRegisterError?: (error: unknown) => void;
}

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

function getLocalStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function detectIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return isIOSUserAgent(navigator.userAgent)
    && !(window as Window & { MSStream?: unknown }).MSStream;
}

function shouldPrompt(storage: StorageLike | null, key: string, cooldownMs: number): boolean {
  if (!storage) return true;
  return isInstallPromptDue(storage.getItem(key), Date.now(), cooldownMs);
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function PWAInstallProvider({
  children,
  promptStorageKey = DEFAULT_INSTALL_PROMPT_STORAGE_KEY,
  promptCooldownMs = DEFAULT_INSTALL_PROMPT_COOLDOWN_MS,
  onBeforeUpdate,
  persistStorageBeforeUpdate = true,
  onRegisterError,
}: PWAInstallProviderProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode);
  const [isIOS] = useState(detectIOS);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // Registration succeeded; consumers only need state changes when an update is available.
    },
    onRegisterError(error) {
      onRegisterError?.(error);
    },
  });

  useEffect(() => {
    if (needRefresh) setShowUpdateSheet(true);
  }, [needRefresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const storage = getLocalStorage();
    const installPromptHandler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (shouldPrompt(storage, promptStorageKey, promptCooldownMs)) {
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

    if (isIOS && !isStandalone && shouldPrompt(storage, promptStorageKey, promptCooldownMs)) {
      setShowIosSheet(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', installPromptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isIOS, isStandalone, promptCooldownMs, promptStorageKey]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowAndroidSheet(false);
    if (choice.outcome === 'accepted') setIsStandalone(true);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    getLocalStorage()?.setItem(promptStorageKey, Date.now().toString());
    setShowAndroidSheet(false);
    setShowIosSheet(false);
  }, [promptStorageKey]);

  const triggerInstallPrompt = useCallback(() => {
    if (isStandalone) return;
    getLocalStorage()?.removeItem(promptStorageKey);
    if (isIOS) {
      setShowIosSheet(true);
    } else if (deferredPrompt) {
      setShowAndroidSheet(true);
    }
  }, [deferredPrompt, isIOS, isStandalone, promptStorageKey]);

  const updateApp = useCallback(async () => {
    await onBeforeUpdate?.();
    if (persistStorageBeforeUpdate) await requestPersistentStorage();
    await updateServiceWorker(true);
  }, [onBeforeUpdate, persistStorageBeforeUpdate, updateServiceWorker]);

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
  const context = useContext(PWAInstallContext);
  if (!context) throw new Error('usePWAInstallContext must be used within PWAInstallProvider');
  return context;
}
