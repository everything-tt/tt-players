import { describe, expect, it } from 'vitest';
import {
  applyUserDataSnapshot,
  backupLocalData,
  clearLocalDataBackup,
  createUserDataSnapshot,
  LEAGUES_STORAGE_KEY,
  LOCAL_DATA_BACKUP_KEY,
  MATCH_JOURNAL_STORAGE_KEY,
  MY_PLAYER_STORAGE_KEY,
  restoreLocalDataBackup,
  THEME_STORAGE_KEY,
  TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY,
} from './local-persistence';
import { FAVOURITES_STORAGE_KEY } from './player-shared';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('local data persistence backup', () => {
  it('backs up known local keys and restores missing values after reload', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['league-1']));
    local.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify([{ id: 'p1', name: 'Alice', played: 3, wins: 2 }]));
    local.setItem(MATCH_JOURNAL_STORAGE_KEY, JSON.stringify({ p1: [] }));

    backupLocalData(local, session);
    local.removeItem(LEAGUES_STORAGE_KEY);
    local.removeItem(MATCH_JOURNAL_STORAGE_KEY);

    expect(restoreLocalDataBackup(local, session)).toBe(2);
    expect(local.getItem(LEAGUES_STORAGE_KEY)).toBe(JSON.stringify(['league-1']));
    expect(local.getItem(FAVOURITES_STORAGE_KEY)).toBe(JSON.stringify([{ id: 'p1', name: 'Alice', played: 3, wins: 2 }]));
    expect(local.getItem(MATCH_JOURNAL_STORAGE_KEY)).toBe(JSON.stringify({ p1: [] }));
    expect(session.getItem(LOCAL_DATA_BACKUP_KEY)).toBeNull();
  });

  it('does not overwrite newer local values', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['old-league']));
    backupLocalData(local, session);
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['new-league']));

    expect(restoreLocalDataBackup(local, session)).toBe(0);
    expect(local.getItem(LEAGUES_STORAGE_KEY)).toBe(JSON.stringify(['new-league']));
  });

  it('can clear pending backups before intentional data reset', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['league-1']));
    backupLocalData(local, session);

    clearLocalDataBackup(session);

    expect(session.getItem(LOCAL_DATA_BACKUP_KEY)).toBeNull();
  });

  it('does not copy account-scoped tournament entry details into a generic backup', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY, JSON.stringify({
      version: 1,
      ownerUserId: 'user-a',
      profiles: [],
    }));

    const backup = backupLocalData(local, session);

    expect(backup.entries[TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY]).toBeUndefined();
  });
});

describe('account data snapshots', () => {
  it('captures preferences and private user data but excludes temporary picker state', () => {
    const local = createStorage();
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['league-1']));
    local.setItem(MY_PLAYER_STORAGE_KEY, JSON.stringify({ id: 'p1', name: 'Alice' }));
    local.setItem(THEME_STORAGE_KEY, 'dark-mode');
    local.setItem('tt_players_h2h_active_player_a', JSON.stringify({ id: 'p2' }));

    const snapshot = createUserDataSnapshot(local);

    expect(snapshot.entries[LEAGUES_STORAGE_KEY]).toBe(JSON.stringify(['league-1']));
    expect(snapshot.entries[MY_PLAYER_STORAGE_KEY]).toBe(JSON.stringify({ id: 'p1', name: 'Alice' }));
    expect(snapshot.entries[THEME_STORAGE_KEY]).toBe('dark-mode');
    expect(snapshot.entries.tt_players_h2h_active_player_a).toBeUndefined();
  });

  it('applies the server snapshot as authoritative, including removals', () => {
    const local = createStorage();
    local.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(['local-league']));
    local.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify([{ id: 'local-player' }]));
    local.setItem(THEME_STORAGE_KEY, 'light-mode');

    const changed = applyUserDataSnapshot({
      version: 1,
      entries: {
        [LEAGUES_STORAGE_KEY]: JSON.stringify(['server-league']),
        [THEME_STORAGE_KEY]: 'dark-mode',
      },
    }, local);

    expect(changed).toBe(true);
    expect(local.getItem(LEAGUES_STORAGE_KEY)).toBe(JSON.stringify(['server-league']));
    expect(local.getItem(THEME_STORAGE_KEY)).toBe('dark-mode');
    expect(local.getItem(FAVOURITES_STORAGE_KEY)).toBeNull();
  });

  it('syncs tournament entry profiles only for the active account owner', () => {
    const local = createStorage();
    const userAStore = JSON.stringify({
      version: 1,
      ownerUserId: 'user-a',
      profiles: [],
    });
    local.setItem(TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY, userAStore);

    expect(createUserDataSnapshot(local, 'user-a').entries[TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY])
      .toBe(userAStore);
    expect(createUserDataSnapshot(local, 'user-b').entries[TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY])
      .toBeUndefined();

    const changed = applyUserDataSnapshot({
      version: 1,
      entries: {
        [TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY]: userAStore,
      },
    }, local, 'user-b');

    expect(changed).toBe(true);
    expect(local.getItem(TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY)).toBeNull();
  });
});
