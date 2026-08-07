/// <reference types="vite-plugin-pwa/react" />

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
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
import {
  createInitialPWAUiState,
  pwaUiReducer,
  runPWAUpdate,
} from './runtime-state';

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
  showInstallSheet: boolean;
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
  return isIOSUserAgent(navigator.userAgent, navigator.maxTouchPoints)
    && !(window as Window & { MSStream?: unknown }).MSStream;
}

function shouldPrompt(storage: StorageLike | null, key: string, cooldownMs: number): boolean {
  if (!storage) return true;
  try {
    return isInstallPromptDue(storage.getItem(key), Date.now(), cooldownMs);
  } catch {
    return true;
  }
}

function recordPromptDismissal(storage: StorageLike | null, key: string): void {
  try {
    storage?.setItem(key, Date.now().toString());
  } catch {
    return;
  }
}

function clearPromptDismissal(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    return;
  }
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
  const [uiState, dispatch] = useReducer(
    pwaUiReducer,
    undefined,
    () => createInitialPWAUiState(isStandaloneMode()),
  );
  const [isIOS] = useState(detectIOS);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {},
    onRegisterError(error) {
      onRegisterError?.(error);
    },
  });

  useEffect(() => {
    if (needRefresh) dispatch({ type: 'update-available' });
  }, [needRefresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const storage = getLocalStorage();
    const installPromptHandler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (shouldPrompt(storage, promptStorageKey, promptCooldownMs)) {
        dispatch({ type: 'install-prompt-available' });
      }
    };
    const installedHandler = () => {
      setDeferredPrompt(null);
      dispatch({ type: 'app-installed' });
    };

    window.addEventListener('beforeinstallprompt', installPromptHandler);
    window.addEventListener('appinstalled', installedHandler);

    if (isIOS && !uiState.isStandalone && shouldPrompt(storage, promptStorageKey, promptCooldownMs)) {
      dispatch({ type: 'ios-prompt-available' });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', installPromptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isIOS, promptCooldownMs, promptStorageKey, uiState.isStandalone]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'dismissed') {
      recordPromptDismissal(getLocalStorage(), promptStorageKey);
    }
    dispatch({ type: 'install-finished', accepted: choice.outcome === 'accepted' });
  }, [deferredPrompt, promptStorageKey]);

  const dismiss = useCallback(() => {
    recordPromptDismissal(getLocalStorage(), promptStorageKey);
    dispatch({ type: 'dismiss-install' });
  }, [promptStorageKey]);

  const triggerInstallPrompt = useCallback(() => {
    if (uiState.isStandalone) return;
    clearPromptDismissal(getLocalStorage(), promptStorageKey);
    if (isIOS) {
      dispatch({ type: 'ios-prompt-available' });
    } else if (deferredPrompt) {
      dispatch({ type: 'install-prompt-available' });
    }
  }, [deferredPrompt, isIOS, promptStorageKey, uiState.isStandalone]);

  const updateApp = useCallback(async () => {
    await runPWAUpdate({
      onBeforeUpdate,
      persistStorageBeforeUpdate,
      requestPersistentStorage,
      activateUpdate: () => updateServiceWorker(true),
    });
  }, [onBeforeUpdate, persistStorageBeforeUpdate, updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    dispatch({ type: 'dismiss-update' });
  }, []);

  const canInstall = !uiState.isStandalone && (Boolean(deferredPrompt) || isIOS);

  return (
    <PWAInstallContext.Provider
      value={{
        showInstallSheet: uiState.showInstallSheet,
        showIosSheet: uiState.showIosSheet,
        showUpdateSheet: uiState.showUpdateSheet,
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
