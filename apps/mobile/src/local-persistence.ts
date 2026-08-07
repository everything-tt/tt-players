import {
  FAVOURITES_STORAGE_KEY,
  FAVOURITE_TEAMS_STORAGE_KEY,
  FAVOURITE_TOURNAMENTS_STORAGE_KEY,
  H2H_FAVOURITES_STORAGE_KEY,
} from './player-shared';

export const LEAGUES_STORAGE_KEY = 'tt_players_selected_league_ids';
export const LEAGUE_ONBOARDING_STORAGE_KEY = 'tt_players_league_onboarding_complete';
export const MY_PLAYER_STORAGE_KEY = 'tt_players_my_player';
export const MY_PLAYER_UPDATED_EVENT = 'tt-players:my-player-updated';
export const MY_TT_PROFILE_STORAGE_KEY = 'tt_players_my_tt_profile';
export const MY_TT_PROFILE_UPDATED_EVENT = 'tt-players:my-tt-profile-updated';
export const TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY = 'tt_players_tournament_entry_profiles';
export const TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT = 'tt-players:tournament-entry-profiles-updated';
export const MATCH_JOURNAL_STORAGE_KEY = 'tt_players_match_journal';
export const MATCH_JOURNAL_UPDATED_EVENT = 'tt-players:match-journal-updated';
export const TOURNAMENT_FILTERS_STORAGE_KEY = 'tt_players_tournament_filters';
export const THEME_STORAGE_KEY = 'TTPlayers-Theme';
export const LOCAL_DATA_BACKUP_KEY = 'tt_players_local_data_backup_v1';

export const SYNCED_LOCAL_DATA_KEYS = [
  LEAGUES_STORAGE_KEY,
  LEAGUE_ONBOARDING_STORAGE_KEY,
  FAVOURITES_STORAGE_KEY,
  H2H_FAVOURITES_STORAGE_KEY,
  FAVOURITE_TEAMS_STORAGE_KEY,
  FAVOURITE_TOURNAMENTS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  MY_PLAYER_STORAGE_KEY,
  MY_TT_PROFILE_STORAGE_KEY,
  TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY,
  MATCH_JOURNAL_STORAGE_KEY,
  TOURNAMENT_FILTERS_STORAGE_KEY,
] as const;

const LOCAL_DATA_KEYS = [
  ...SYNCED_LOCAL_DATA_KEYS.filter((key) => key !== TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY),
  'tt_players_h2h_active_player_a',
  'tt_players_h2h_active_player_b',
] as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface UserDataSnapshot {
  version: 1;
  entries: Record<string, string>;
}

export interface LocalDataBackup {
  version: 1;
  created_at: string;
  entries: Record<string, string>;
}

function isOwnedTournamentEntryProfiles(value: string, userId: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    const store = parsed as Record<string, unknown>;
    return store.version === 1
      && store.ownerUserId === userId
      && Array.isArray(store.profiles);
  } catch {
    return false;
  }
}

export function createUserDataSnapshot(
  local: StorageLike = localStorage,
  userId?: string,
): UserDataSnapshot {
  const entries: Record<string, string> = {};
  for (const key of SYNCED_LOCAL_DATA_KEYS) {
    const value = local.getItem(key);
    if (value === null) continue;
    if (key === TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY) {
      if (!userId || !isOwnedTournamentEntryProfiles(value, userId)) continue;
    }
    entries[key] = value;
  }
  return { version: 1, entries };
}

export function applyUserDataSnapshot(
  snapshot: UserDataSnapshot,
  local: StorageLike = localStorage,
  userId?: string,
): boolean {
  if (snapshot.version !== 1 || !snapshot.entries || typeof snapshot.entries !== 'object') {
    return false;
  }

  let changed = false;
  for (const key of SYNCED_LOCAL_DATA_KEYS) {
    const current = local.getItem(key);
    let next: string | null = Object.prototype.hasOwnProperty.call(snapshot.entries, key)
      ? snapshot.entries[key]
      : null;
    if (key === TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY) {
      if (!userId || !next || !isOwnedTournamentEntryProfiles(next, userId)) next = null;
    }
    if (current === next) continue;

    changed = true;
    if (next === null) local.removeItem(key);
    else local.setItem(key, next);
  }
  return changed;
}

export function serializeUserDataSnapshot(snapshot: UserDataSnapshot): string {
  const orderedEntries: Record<string, string> = {};
  for (const key of SYNCED_LOCAL_DATA_KEYS) {
    const value = snapshot.entries[key];
    if (value !== undefined) orderedEntries[key] = value;
  }
  return JSON.stringify({ version: 1, entries: orderedEntries });
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
