import { describe, expect, it, vi } from 'vitest';
import {
  createInitialPWAUiState,
  pwaUiReducer,
  runPWAUpdate,
} from './runtime-state';

describe('pwaUiReducer', () => {
  it('opens a generic install sheet when the browser install prompt is available', () => {
    const state = pwaUiReducer(
      createInitialPWAUiState(false),
      { type: 'install-prompt-available' },
    );
    expect(state.showInstallSheet).toBe(true);
  });

  it('opens iOS guidance and closes install UI after installation', () => {
    const prompted = pwaUiReducer(
      createInitialPWAUiState(false),
      { type: 'ios-prompt-available' },
    );
    expect(prompted.showIosSheet).toBe(true);

    const installed = pwaUiReducer(prompted, { type: 'app-installed' });
    expect(installed).toMatchObject({
      showInstallSheet: false,
      showIosSheet: false,
      isStandalone: true,
    });
  });

  it('tracks and dismisses service-worker updates independently', () => {
    const available = pwaUiReducer(
      createInitialPWAUiState(false),
      { type: 'update-available' },
    );
    expect(available.showUpdateSheet).toBe(true);

    const dismissed = pwaUiReducer(available, { type: 'dismiss-update' });
    expect(dismissed.showUpdateSheet).toBe(false);
  });

  it('marks an accepted browser install as standalone', () => {
    const installed = pwaUiReducer(
      { ...createInitialPWAUiState(false), showInstallSheet: true },
      { type: 'install-finished', accepted: true },
    );
    expect(installed).toMatchObject({ showInstallSheet: false, isStandalone: true });
  });
});

describe('runPWAUpdate', () => {
  it('backs up app data, requests persistence, then activates the update', async () => {
    const calls: string[] = [];
    const onBeforeUpdate = vi.fn(() => { calls.push('before'); });
    const requestPersistentStorage = vi.fn(async () => {
      calls.push('persist');
      return true;
    });
    const activateUpdate = vi.fn(async () => { calls.push('activate'); });

    await runPWAUpdate({
      onBeforeUpdate,
      persistStorageBeforeUpdate: true,
      requestPersistentStorage,
      activateUpdate,
    });

    expect(calls).toEqual(['before', 'persist', 'activate']);
  });

  it('can activate an update without requesting persistent storage', async () => {
    const requestPersistentStorage = vi.fn(async () => true);
    const activateUpdate = vi.fn(async () => undefined);

    await runPWAUpdate({
      persistStorageBeforeUpdate: false,
      requestPersistentStorage,
      activateUpdate,
    });

    expect(requestPersistentStorage).not.toHaveBeenCalled();
    expect(activateUpdate).toHaveBeenCalledOnce();
  });
});
