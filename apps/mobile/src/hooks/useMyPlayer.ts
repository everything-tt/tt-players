import { useCallback, useEffect, useState } from 'react';
import {
  MY_PLAYER_STORAGE_KEY,
  MY_PLAYER_UPDATED_EVENT,
  notifyUserDataChanged,
} from '../local-persistence';
import { useSsrHydration } from '../ssr/runtime-context';

export interface MyPlayer {
  id: string;
  name: string;
}

function isMyPlayerValue(value: unknown): value is MyPlayer {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && candidate.id.length > 0
    && typeof candidate.name === 'string'
    && candidate.name.trim().length > 0;
}

function readMyPlayer(): MyPlayer | null {
  try {
    const raw = localStorage.getItem(MY_PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isMyPlayerValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function useMyPlayer() {
  const isSsrHydration = useSsrHydration();
  const [player, setPlayerState] = useState<MyPlayer | null>(() => (
    isSsrHydration ? null : readMyPlayer()
  ));

  useEffect(() => {
    const sync = () => setPlayerState(readMyPlayer());
    if (isSsrHydration) sync();
    window.addEventListener('storage', sync);
    window.addEventListener(MY_PLAYER_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MY_PLAYER_UPDATED_EVENT, sync);
    };
  }, [isSsrHydration]);

  const persist = useCallback((next: MyPlayer | null) => {
    if (next) {
      localStorage.setItem(MY_PLAYER_STORAGE_KEY, JSON.stringify({
        id: next.id,
        name: next.name.trim(),
      }));
    } else {
      localStorage.removeItem(MY_PLAYER_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(MY_PLAYER_UPDATED_EVENT));
    notifyUserDataChanged();
  }, []);

  const isMyPlayer = useCallback(
    (playerId: string) => player?.id === playerId,
    [player],
  );

  return {
    player,
    isMyPlayer,
    setMyPlayer: (next: MyPlayer) => persist(next),
    clear: () => persist(null),
  };
}
