import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, type AuthState } from './lib/auth';
import {
  applyUserDataSnapshot,
  clearLocalDataBackup,
  clearSyncedLocalData,
  createUserDataSnapshot,
  diffUserDataSnapshots,
  getLocalSyncOwner,
  notifyUserDataApplied,
  reconcileServerSnapshot,
  setLocalSyncOwner,
  USER_DATA_CHANGED_EVENT,
  type UserDataChanges,
  type UserDataSnapshot,
} from './local-persistence';
import { API_BASE_URL } from './player-shared';

const CHANGE_CHECK_INTERVAL_MS = 2_000;
const BOOTSTRAP_RETRY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface SyncStateResponse {
  data: UserDataSnapshot;
  updated_at: string;
  source: 'local' | 'server';
}

export function shouldRenderSyncedChildren(
  authLoading: boolean,
  sessionUserId: string | null,
  hydratedUserId: string | null,
  localOwnerUserId: string | null = null,
): boolean {
  if (authLoading) return false;
  if (!sessionUserId) return hydratedUserId === null && localOwnerUserId === null;
  return hydratedUserId === sessionUserId || localOwnerUserId === sessionUserId;
}

export function UserDataSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const sessionRef = useRef<AuthState['session']>(auth.session);
  const lastSyncedSnapshot = useRef<UserDataSnapshot | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [localOwnerUserId, setLocalOwnerUserId] = useState<string | null>(() => getLocalSyncOwner());
  const [dataRevision, setDataRevision] = useState(0);

  sessionRef.current = auth.session;

  const publishAppliedData = useCallback(() => {
    notifyUserDataApplied();
    // Some root views still initialise localStorage-backed state only on mount.
    // A revision key guarantees an authoritative server apply becomes visible
    // everywhere without relying on a full page reload.
    setDataRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (auth.loading) return;

    if (!auth.session) {
      // Anonymous preferences are intentionally local and should survive normal
      // anonymous launches. Only clear when the cache is explicitly marked as
      // belonging to a previously signed-in account (including sign-out).
      const owner = getLocalSyncOwner();
      const changed = owner ? clearSyncedLocalData() : false;
      setLocalOwnerUserId(null);
      setHydratedUserId(null);
      lastSyncedSnapshot.current = null;
      if (changed) {
        clearLocalDataBackup();
        publishAppliedData();
      }
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const userId = auth.session.user.id;
    const previousOwner = getLocalSyncOwner();

    // A localStorage cache owned by a different signed-in account must never be
    // used to seed or render this account. Anonymous (unowned) preferences may
    // still seed the first account bootstrap, preserving the original sign-in
    // behaviour for people who configured the app before creating a session.
    if (previousOwner && previousOwner !== userId) {
      const changed = clearSyncedLocalData();
      setLocalOwnerUserId(null);
      if (changed) publishAppliedData();
    }

    setHydratedUserId((current) => current === userId ? current : null);
    lastSyncedSnapshot.current = null;

    const bootstrap = async () => {
      const session = sessionRef.current;
      if (!session || session.user.id !== userId) return;

      try {
        const localSnapshot = createUserDataSnapshot(localStorage, userId);
        const response = await sendSnapshotRequest(
          '/me/sync-state/bootstrap',
          session.access_token,
          localSnapshot,
        );
        if (cancelled) return;

        const changed = applyUserDataSnapshot(response.data, localStorage, userId);
        lastSyncedSnapshot.current = response.data;
        setLocalSyncOwner(userId);
        setLocalOwnerUserId(userId);
        setHydratedUserId(userId);

        if (changed) {
          clearLocalDataBackup();
          publishAppliedData();
        }
      } catch {
        if (cancelled) return;

        // Do not make an already-authenticated PWA unusable during a temporary
        // API outage. A cache is safe to render when it is anonymous or already
        // owned by this account; writes remain paused until a server baseline
        // has been obtained successfully.
        const owner = getLocalSyncOwner();
        if (!owner || owner === userId) setHydratedUserId(userId);
        retryTimer = window.setTimeout(() => void bootstrap(), BOOTSTRAP_RETRY_MS);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [auth.loading, auth.session?.user.id, publishAppliedData]);

  useEffect(() => {
    const userId = auth.session?.user.id ?? null;
    if (!userId || hydratedUserId !== userId) return;

    let cancelled = false;
    let syncing = false;
    let rerunRequested = false;
    let pullRequested = false;

    const requestRerunIfDirty = () => {
      const baseline = lastSyncedSnapshot.current;
      if (!baseline) return;
      const current = createUserDataSnapshot(localStorage, userId);
      if (Object.keys(diffUserDataSnapshots(baseline, current)).length > 0) {
        rerunRequested = true;
      }
    };

    const pushOnce = async (): Promise<void> => {
      const baseline = lastSyncedSnapshot.current;
      const session = sessionRef.current;
      if (!baseline || !session || session.user.id !== userId) return;

      const observedLocal = createUserDataSnapshot(localStorage, userId);
      const changes = diffUserDataSnapshots(baseline, observedLocal);
      if (Object.keys(changes).length === 0) return;

      const response = await sendPatchRequest(session.access_token, changes);
      if (cancelled) return;

      const latestLocal = createUserDataSnapshot(localStorage, userId);
      const reconciled = reconcileServerSnapshot(response.data, observedLocal, latestLocal);
      const changed = applyUserDataSnapshot(reconciled, localStorage, userId);
      lastSyncedSnapshot.current = response.data;
      if (changed) publishAppliedData();
      requestRerunIfDirty();
    };

    const pullOnce = async (): Promise<void> => {
      const session = sessionRef.current;
      if (!lastSyncedSnapshot.current || !session || session.user.id !== userId) return;

      const observedLocal = createUserDataSnapshot(localStorage, userId);
      const response = await sendGetRequest(session.access_token);
      if (cancelled) return;

      const latestLocal = createUserDataSnapshot(localStorage, userId);
      const reconciled = reconcileServerSnapshot(response.data, observedLocal, latestLocal);
      const changed = applyUserDataSnapshot(reconciled, localStorage, userId);
      lastSyncedSnapshot.current = response.data;
      if (changed) publishAppliedData();
      requestRerunIfDirty();
    };

    const synchronize = async (pull = false) => {
      if (cancelled) return;
      if (pull) pullRequested = true;
      if (syncing) {
        rerunRequested = true;
        return;
      }

      syncing = true;
      try {
        do {
          rerunRequested = false;
          const shouldPull = pullRequested;
          pullRequested = false;
          try {
            await pushOnce();
            if (shouldPull) await pullOnce();
          } catch {
            // Keep the existing server baseline. The fallback interval, focus,
            // visibility and online events will retry without discarding edits.
          }
        } while (!cancelled && rerunRequested);
      } finally {
        syncing = false;
      }
    };

    const interval = window.setInterval(() => void synchronize(false), CHANGE_CHECK_INTERVAL_MS);
    const handleLocalChange = () => void synchronize(false);
    const handleStorage = () => void synchronize(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void synchronize(true);
    };
    const handleFocus = () => void synchronize(true);
    const handleOnline = () => void synchronize(true);

    window.addEventListener(USER_DATA_CHANGED_EVENT, handleLocalChange);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(USER_DATA_CHANGED_EVENT, handleLocalChange);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [auth.session?.user.id, hydratedUserId, publishAppliedData]);

  const sessionUserId = auth.session?.user.id ?? null;
  if (!shouldRenderSyncedChildren(auth.loading, sessionUserId, hydratedUserId, localOwnerUserId)) return null;

  return (
    <Fragment key={`${sessionUserId ?? 'anonymous'}:${dataRevision}`}>
      {children}
    </Fragment>
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function sendSnapshotRequest(
  path: string,
  accessToken: string,
  snapshot: UserDataSnapshot,
): Promise<SyncStateResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<SyncStateResponse>;
}

async function sendPatchRequest(
  accessToken: string,
  changes: UserDataChanges,
): Promise<SyncStateResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/me/sync-state`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version: 1, changes }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<SyncStateResponse>;
}

async function sendGetRequest(accessToken: string): Promise<SyncStateResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/me/sync-state`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<SyncStateResponse>;
}
