import { useEffect, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export interface UseSearchOptions {
  /** Minimum characters before a server search fires. Omit/0 for client filters. */
  minLength?: number;
  /** Debounce in ms. Defaults to 250. */
  debounceMs?: number;
  /** Master switch (e.g. `isOpen` for sheets). Defaults to true. */
  enabled?: boolean;
  /** Reset the query when disabled (sheet closed). Defaults to true. */
  resetOnDisable?: boolean;
}

export interface UseSearchResult {
  query: string;
  setQuery: (value: string) => void;
  /** Raw trimmed query. */
  normalizedQuery: string;
  /** Debounced + trimmed query. */
  debouncedQuery: string;
  /** True when the query meets the minimum length (server searches). */
  isReady: boolean;
  /** True when there is input but it's shorter than `minLength`. */
  isTooShort: boolean;
  /** True when there is any non-empty input. */
  isActive: boolean;
}

/**
 * Single contract for every search surface. Enforces: 3-char minimum for server
 * searches (replaces ad-hoc `isSearchMode`/`isShortSearchQuery` flags), 250ms
 * debounce via the shared `useDebouncedValue` (replaces the hand-rolled copy in
 * PlayerSearchSheet), and a clean reset when a sheet closes.
 */
export function useSearch({
  minLength = 0,
  debounceMs = 250,
  enabled = true,
  resetOnDisable = true,
}: UseSearchOptions = {}): UseSearchResult {
  const [query, setQuery] = useState('');
  const debouncedRaw = useDebouncedValue(query, debounceMs);
  const normalizedQuery = query.trim();
  const debouncedQuery = debouncedRaw.trim();

  useEffect(() => {
    if (!enabled && resetOnDisable) {
      setQuery('');
    }
  }, [enabled, resetOnDisable]);

  const meetsMin = minLength > 0 ? normalizedQuery.length >= minLength : normalizedQuery.length > 0;
  const isReady = enabled && (minLength > 0 ? debouncedQuery.length >= minLength : debouncedQuery.length > 0);
  const isTooShort = enabled && minLength > 0 && normalizedQuery.length > 0 && normalizedQuery.length < minLength;

  return {
    query,
    setQuery,
    normalizedQuery,
    debouncedQuery,
    isReady,
    isTooShort,
    isActive: meetsMin,
  };
}
