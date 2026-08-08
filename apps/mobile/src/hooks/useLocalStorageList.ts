import { useCallback, useEffect, useState } from 'react';
import { notifyUserDataChanged } from '../local-persistence';
import { useSsrHydration } from '../ssr/runtime-context';

/**
 * Generic reactive list persisted to localStorage + synced across tabs/components
 * via the `storage` event and a custom window event. Replaces ~5 inline copies
 * (players, h2h, tournaments favourites) that each re-implemented this pattern.
 */
export function useLocalStorageList<T>(
  storageKey: string,
  updatedEventName: string,
  isValid: (value: unknown) => value is T,
): readonly [T[], {
  set: (next: T[]) => void;
  add: (item: T, matcher?: (existing: T) => boolean) => void;
  remove: (matcher: (existing: T) => boolean) => void;
  toggle: (item: T, matcher: (existing: T) => boolean) => void;
  has: (matcher: (existing: T) => boolean) => boolean;
  clear: () => void;
}] {
  const isSsrHydration = useSsrHydration();
  const read = useCallback((): T[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValid);
    } catch {
      return [];
    }
  }, [storageKey, isValid]);

  // SSR and the browser's first hydration render must agree. Persisted state is
  // restored immediately after hydration; ordinary SPA loads keep the eager read.
  const [items, setItems] = useState<T[]>(() => (isSsrHydration ? [] : read()));

  const persist = useCallback((next: T[]) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(updatedEventName));
    notifyUserDataChanged();
  }, [storageKey, updatedEventName]);

  const set = useCallback((next: T[]) => {
    setItems(next);
    persist(next);
  }, [persist]);

  const has = useCallback((matcher: (existing: T) => boolean) => items.some(matcher), [items]);

  const add = useCallback((item: T, matcher?: (existing: T) => boolean) => {
    setItems((previous) => {
      if (matcher && previous.some(matcher)) return previous;
      const next = matcher
        ? [item, ...previous.filter((x) => !matcher(x))]
        : [item, ...previous];
      persist(next);
      return next;
    });
  }, [persist]);

  const remove = useCallback((matcher: (existing: T) => boolean) => {
    setItems((previous) => {
      const next = previous.filter((x) => !matcher(x));
      persist(next);
      return next;
    });
  }, [persist]);

  const toggle = useCallback((item: T, matcher: (existing: T) => boolean) => {
    setItems((previous) => {
      const exists = previous.some(matcher);
      const next = exists
        ? previous.filter((x) => !matcher(x))
        : [item, ...previous.filter((x) => !matcher(x))];
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setItems([]);
    persist([]);
  }, [persist]);

  useEffect(() => {
    const sync = () => setItems(read());
    if (isSsrHydration) sync();
    window.addEventListener('storage', sync);
    window.addEventListener(updatedEventName, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(updatedEventName, sync);
    };
  }, [isSsrHydration, read, updatedEventName]);

  return [items, { set, add, remove, toggle, has, clear }] as const;
}
