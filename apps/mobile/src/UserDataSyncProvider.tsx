import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth, type AuthState } from './lib/auth';
import {
  applyUserDataSnapshot,
  clearLocalDataBackup,
  createUserDataSnapshot,
  serializeUserDataSnapshot,
  type UserDataSnapshot,
} from './local-persistence';
import { API_BASE_URL } from './player-shared';

const CHANGE_CHECK_INTERVAL_MS = 2_000;
const BOOTSTRAP_RETRY_MS = 15_000;

interface SyncStateResponse {
  data: UserDataSnapshot;
  updated_at: string;
  source: 'local' | 'server';
}

export function shouldRenderSyncedChildren(
  authLoading: boolean,
  sessionUserId: string | null,
  hydratedUserId: string | null,
): boolean {
  if (authLoading) return false;
  if (!sessionUserId) return true;
  return hydratedUserId === sessionUserId;
}

export function UserDataSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const sessionRef = useRef<AuthState['session']>(auth.session);
  const lastSyncedSnapshot = useRef('');
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  sessionRef.current = auth.session;

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.session) {
      setHydratedUserId(null);
      lastSyncedSnapshot.current = '';
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const userId = auth.session.user.id;

    // Do not let account-aware children mount until this bootstrap has applied
    // the authoritative server snapshot. Many of those children initialise
    // React state from localStorage only once on mount, so mounting first and
    // mutating storage afterwards can leave the UI showing stale anonymous or
    // pre-login data.
    setHydratedUserId((current) => current === userId ? current : null);

    const bootstrap = async () => {
      const session = sessionRef.current;
      if (!session || session.user.id !== userId) return;

      try {
        const localSnapshot = createUserDataSnapshot(localStorage, userId);
        const response = await sendSyncRequest(
          '/me/sync-state/bootstrap',
          'POST',
          session.access_token,
          localSnapshot,
        );
        if (cancelled) return;

        const changed = applyUserDataSnapshot(response.data, localStorage, userId);
        if (changed) clearLocalDataBackup();
        lastSyncedSnapshot.current = serializeUserDataSnapshot(response.data);
        setHydratedUserId(userId);
      } catch {
        if (!cancelled) {
          retryTimer = window.setTimeout(() => void bootstrap(), BOOTSTRAP_RETRY_MS);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [auth.loading, auth.session?.user.id]);

  useEffect(() => {
    const userId = auth.session?.user.id ?? null;
    if (!userId || hydratedUserId !== userId) return;

    let cancelled = false;
    let writing = false;

    const pushLocalChanges = async () => {
      if (writing || cancelled) return;
      const session = sessionRef.current;
      if (!session || session.user.id !== userId) return;

      const snapshot = createUserDataSnapshot(localStorage, userId);
      const serialized = serializeUserDataSnapshot(snapshot);
      if (serialized === lastSyncedSnapshot.current) return;

      writing = true;
      try {
        const response = await sendSyncRequest(
          '/me/sync-state',
          'PUT',
          session.access_token,
          snapshot,
        );
        if (!cancelled) {
          lastSyncedSnapshot.current = serializeUserDataSnapshot(response.data);
        }
      } catch {
        // Keep the previous fingerprint so the interval retries automatically.
      } finally {
        writing = false;
      }
    };

    const interval = window.setInterval(() => void pushLocalChanges(), CHANGE_CHECK_INTERVAL_MS);
    const handleStorage = () => void pushLocalChanges();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void pushLocalChanges();
    };
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [auth.session?.user.id, hydratedUserId]);

  const sessionUserId = auth.session?.user.id ?? null;
  if (!shouldRenderSyncedChildren(auth.loading, sessionUserId, hydratedUserId)) return null;

  return children;
}

async function sendSyncRequest(
  path: string,
  method: 'POST' | 'PUT',
  accessToken: string,
  snapshot: UserDataSnapshot,
): Promise<SyncStateResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<SyncStateResponse>;
}
