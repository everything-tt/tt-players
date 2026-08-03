import { describe, expect, it } from 'vitest';
import {
  MY_PLAYER_STORAGE_KEY,
  MY_TT_PROFILE_STORAGE_KEY,
  createUserDataSnapshot,
} from './local-persistence';

function createStorage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('My TT account storage', () => {
  it('syncs the claimed player and editable My TT profile as separate entries', () => {
    const player = JSON.stringify({ id: 'player-1', name: 'Test Player' });
    const myTTProfile = JSON.stringify({
      version: 1,
      playerId: 'player-1',
      playerName: 'Test Player',
      playingStyle: 'attacking',
    });

    const snapshot = createUserDataSnapshot(createStorage({
      [MY_PLAYER_STORAGE_KEY]: player,
      [MY_TT_PROFILE_STORAGE_KEY]: myTTProfile,
    }));

    expect(snapshot.entries[MY_PLAYER_STORAGE_KEY]).toBe(player);
    expect(snapshot.entries[MY_TT_PROFILE_STORAGE_KEY]).toBe(myTTProfile);
    expect(MY_PLAYER_STORAGE_KEY).not.toBe(MY_TT_PROFILE_STORAGE_KEY);
  });
});
