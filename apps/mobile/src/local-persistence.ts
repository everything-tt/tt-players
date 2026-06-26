import {
  FAVOURITES_STORAGE_KEY,
  FAVOURITE_TEAMS_STORAGE_KEY,
  FAVOURITE_TOURNAMENTS_STORAGE_KEY,
  H2H_FAVOURITES_STORAGE_KEY,
} from './player-shared';

export const LEAGUES_STORAGE_KEY = 'tt_players_selected_league_ids';
export const LEAGUE_ONBOARDING_STORAGE_KEY = 'tt_players_league_onboarding_complete';
export const LOCAL_DATA_BACKUP_KEY = 'tt_players_local_data_backup_v1';

const LOCAL_DATA_KEYS = [
  LEAGUES_STORAGE_KEY,
  LEAGUE_ONBOARDING_STORAGE_KEY,
  FAVOURITES_STORAGE_KEY,
  H2H_FAVOURITES_STORAGE_KEY,
  FAVOURITE_TEAMS_STORAGE_KEY,
  FAVOURITE_TOURNAMENTS_STORAGE_KEY,
  'tt_players_h2h_active_player_a',
  'tt_players_h2h_active_player_b',
  'TTPlayers-Theme',
] as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LocalDataBackup {
  version: 1;
  created_at: string;
  entries: Record<string, string>;
}

export function backupLocalData(local: StorageLike = localStorage, session: StorageLike = sessionStorage): LocalDataBackup {
  const entries: Record<string, string> = {};
  for (const key of LOCAL_DATA_KEYS) {
    const value = local.getItem(key);
    if (value !== null) entries[key] = value;
  }

  const backup: LocalDataBackup = {
    version: 1,
    created_at: new Date().toISOString(),
    entries,
  };
  session.setItem(LOCAL_DATA_BACKUP_KEY, JSON.stringify(backup));
  return backup;
}

export function restoreLocalDataBackup(local: StorageLike = localStorage, session: StorageLike = sessionStorage): number {
  const raw = session.getItem(LOCAL_DATA_BACKUP_KEY);
  if (!raw) return 0;

  let backup: LocalDataBackup;
  try {
    backup = JSON.parse(raw) as LocalDataBackup;
  } catch {
    session.removeItem(LOCAL_DATA_BACKUP_KEY);
    return 0;
  }

  if (backup.version !== 1 || !backup.entries || typeof backup.entries !== 'object') {
    session.removeItem(LOCAL_DATA_BACKUP_KEY);
    return 0;
  }

  let restored = 0;
  for (const [key, value] of Object.entries(backup.entries)) {
    if (!(LOCAL_DATA_KEYS as readonly string[]).includes(key)) continue;
    if (local.getItem(key) !== null) continue;
    local.setItem(key, value);
    restored += 1;
  }
  session.removeItem(LOCAL_DATA_BACKUP_KEY);
  return restored;
}

export function clearLocalDataBackup(session: StorageLike = sessionStorage): void {
  session.removeItem(LOCAL_DATA_BACKUP_KEY);
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
