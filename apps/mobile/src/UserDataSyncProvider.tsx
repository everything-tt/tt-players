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

        const mergedSnapshot: UserDataSnapshot = {
          version: 1,
          entries: {
            ...localSnapshot.entries,
            ...response.data.entries,
          },
        };

        const changed = applyUserDataSnapshot(mergedSnapshot, localStorage, userId);
        lastSyncedSnapshot.current = serializeUserDataSnapshot(mergedSnapshot);
        setHydratedUserId(userId);

        if (changed) {
          clearLocalDataBackup();
          window.location.reload();
        }
      } catch (error) {
        if (cancelled) return;
        // An invalid or expired session should not be retried forever; drop it
        // and wait for the user to sign in again.
        if ((error as SyncRequestError).status === 401) {
          void auth.signOut();
          return;
        }
        retryTimer = window.setTimeout(() => void bootstrap(), BOOTSTRAP_RETRY_MS);
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
      } catch (error) {
        // An invalid or expired session should not be retried; drop it and
        // wait for the user to sign in again. Other errors keep the previous
        // fingerprint so the interval retries automatically.
        if ((error as SyncRequestError).status === 401) {
          void auth.signOut();
        }
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

  return children;
}

interface SyncRequestError extends Error {
  status?: number;
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

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as SyncRequestError;
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<SyncStateResponse>;
}
