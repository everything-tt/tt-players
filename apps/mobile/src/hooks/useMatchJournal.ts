import { useCallback, useEffect, useState } from 'react';

export type JournalOutcome = 'win' | 'loss' | 'practice';

export interface MatchJournalEntry {
  id: string;
  createdAt: string;
  matchDate: string;
  opponent: string;
  outcome: JournalOutcome;
  workedWell: string;
  mainIssue: string;
  nextGoal: string;
}

export type NewMatchJournalEntry = Omit<MatchJournalEntry, 'id' | 'createdAt'>;

const JOURNAL_STORAGE_KEY = 'tt_players_match_journal';
const JOURNAL_UPDATED_EVENT = 'tt-players:match-journal-updated';

type StoredJournals = Record<string, MatchJournalEntry[]>;

function isJournalEntry(value: unknown): value is MatchJournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && typeof entry.createdAt === 'string'
    && typeof entry.matchDate === 'string'
    && typeof entry.opponent === 'string'
    && (entry.outcome === 'win' || entry.outcome === 'loss' || entry.outcome === 'practice')
    && typeof entry.workedWell === 'string'
    && typeof entry.mainIssue === 'string'
    && typeof entry.nextGoal === 'string';
}

function readJournals(): StoredJournals {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const valid: StoredJournals = {};
    for (const [playerId, entries] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      valid[playerId] = entries.filter(isJournalEntry);
    }
    return valid;
  } catch {
    return {};
  }
}

function createEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useMatchJournal(playerId: string) {
  const [entries, setEntries] = useState<MatchJournalEntry[]>(() => readJournals()[playerId] ?? []);

  useEffect(() => {
    const sync = () => setEntries(readJournals()[playerId] ?? []);
    window.addEventListener('storage', sync);
    window.addEventListener(JOURNAL_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(JOURNAL_UPDATED_EVENT, sync);
    };
  }, [playerId]);

  const writeEntries = useCallback((nextEntries: MatchJournalEntry[]) => {
    const all = readJournals();
    if (nextEntries.length > 0) all[playerId] = nextEntries;
    else delete all[playerId];
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(JOURNAL_UPDATED_EVENT));
  }, [playerId]);

  const add = useCallback((entry: NewMatchJournalEntry) => {
    const next: MatchJournalEntry = {
      ...entry,
      id: createEntryId(),
      createdAt: new Date().toISOString(),
    };
    writeEntries([next, ...(readJournals()[playerId] ?? [])]);
    return next;
  }, [playerId, writeEntries]);

  const remove = useCallback((entryId: string) => {
    writeEntries((readJournals()[playerId] ?? []).filter((entry) => entry.id !== entryId));
  }, [playerId, writeEntries]);

  return { entries, add, remove };
}
