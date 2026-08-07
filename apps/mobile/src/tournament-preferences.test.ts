import { describe, expect, it } from 'vitest';
import { TOURNAMENT_FILTERS_STORAGE_KEY } from './local-persistence';
import {
  DEFAULT_TOURNAMENT_PREFERENCES,
  readTournamentPreferences,
  writeTournamentPreferences,
} from './tournament-preferences';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('tournament preferences', () => {
  it('uses defaults when no persisted choice exists', () => {
    expect(readTournamentPreferences(createStorage())).toEqual(DEFAULT_TOURNAMENT_PREFERENCES);
  });

  it('persists and restores the tournament browsing choices', () => {
    const storage = createStorage();

    writeTournamentPreferences({
      status: 'completed',
      savedOnly: true,
      categories: ['junior', 'girls'],
    }, storage);

    expect(readTournamentPreferences(storage)).toEqual({
      version: 1,
      status: 'completed',
      savedOnly: true,
      categories: ['junior', 'girls'],
    });
  });

  it('sanitizes unsupported values from stored data', () => {
    const storage = createStorage();
    storage.setItem(TOURNAMENT_FILTERS_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'invalid',
      savedOnly: 'yes',
      categories: ['junior', 'unsupported', 'junior'],
    }));

    expect(readTournamentPreferences(storage)).toEqual({
      version: 1,
      status: 'upcoming',
      savedOnly: false,
      categories: ['junior'],
    });
  });
});
