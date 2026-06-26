import { describe, expect, it } from 'vitest';
import {
  backupLocalData,
  clearLocalDataBackup,
  LEAGUES_STORAGE_KEY,
  LOCAL_DATA_BACKUP_KEY,
  restoreLocalDataBackup,
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

    backupLocalData(local, session);
    local.removeItem(LEAGUES_STORAGE_KEY);

    expect(restoreLocalDataBackup(local, session)).toBe(1);
    expect(local.getItem(LEAGUES_STORAGE_KEY)).toBe(JSON.stringify(['league-1']));
    expect(local.getItem(FAVOURITES_STORAGE_KEY)).toBe(JSON.stringify([{ id: 'p1', name: 'Alice', played: 3, wins: 2 }]));
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
});
