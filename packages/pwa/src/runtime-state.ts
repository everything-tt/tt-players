export interface PWAUiState {
  showInstallSheet: boolean;
  showIosSheet: boolean;
  showUpdateSheet: boolean;
  isStandalone: boolean;
}

export type PWAUiAction =
  | { type: 'install-prompt-available' }
  | { type: 'ios-prompt-available' }
  | { type: 'install-finished'; accepted: boolean }
  | { type: 'app-installed' }
  | { type: 'dismiss-install' }
  | { type: 'update-available' }
  | { type: 'dismiss-update' };

export function createInitialPWAUiState(isStandalone: boolean): PWAUiState {
  return {
    showInstallSheet: false,
    showIosSheet: false,
    showUpdateSheet: false,
    isStandalone,
  };
}

export function pwaUiReducer(state: PWAUiState, action: PWAUiAction): PWAUiState {
  switch (action.type) {
    case 'install-prompt-available':
      return state.isStandalone ? state : { ...state, showInstallSheet: true };
    case 'ios-prompt-available':
      return state.isStandalone ? state : { ...state, showIosSheet: true };
    case 'install-finished':
      return {
        ...state,
        showInstallSheet: false,
        isStandalone: action.accepted || state.isStandalone,
      };
    case 'app-installed':
      return {
        ...state,
        showInstallSheet: false,
        showIosSheet: false,
        isStandalone: true,
      };
    case 'dismiss-install':
      return { ...state, showInstallSheet: false, showIosSheet: false };
    case 'update-available':
      return { ...state, showUpdateSheet: true };
    case 'dismiss-update':
      return { ...state, showUpdateSheet: false };
    default:
      return state;
  }
}

export interface RunPWAUpdateOptions {
  onBeforeUpdate?: () => void | Promise<void>;
  persistStorageBeforeUpdate: boolean;
  requestPersistentStorage: () => Promise<boolean>;
  activateUpdate: () => Promise<void>;
}

export async function runPWAUpdate({
  onBeforeUpdate,
  persistStorageBeforeUpdate,
  requestPersistentStorage,
  activateUpdate,
}: RunPWAUpdateOptions): Promise<void> {
  await onBeforeUpdate?.();
  if (persistStorageBeforeUpdate) await requestPersistentStorage();
  await activateUpdate();
}
