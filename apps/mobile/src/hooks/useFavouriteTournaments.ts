import { useCallback } from 'react';
import { useLocalStorageList } from './useLocalStorageList';
import {
  FAVOURITE_TOURNAMENTS_STORAGE_KEY,
  FAVOURITE_TOURNAMENTS_UPDATED_EVENT,
  isValidFavouriteTournament,
  type EventItem,
  type FavouriteTournament,
} from '../player-shared';

/** Reactive favourite tournaments. Replaces the inline copies in EventsTabContent + EventDetailPage. */
export function useFavouriteTournaments() {
  const [items, api] = useLocalStorageList<FavouriteTournament>(
    FAVOURITE_TOURNAMENTS_STORAGE_KEY,
    FAVOURITE_TOURNAMENTS_UPDATED_EVENT,
    isValidFavouriteTournament,
  );

  const isFavourite = useCallback(
    (eventId: string) => items.some((t) => t.id === eventId),
    [items],
  );

  const fromEvent = useCallback(
    (event: Pick<EventItem, 'id' | 'name' | 'event_date' | 'category' | 'platform_name' | 'match_count'>): FavouriteTournament => ({
      id: event.id,
      name: event.name,
      event_date: event.event_date,
      category: event.category,
      platform_name: event.platform_name,
      match_count: event.match_count,
    }),
    [],
  );

  const toggle = useCallback(
    (event: Pick<EventItem, 'id' | 'name' | 'event_date' | 'category' | 'platform_name' | 'match_count'>) =>
      api.toggle(fromEvent(event), (t) => t.id === event.id),
    [api, fromEvent],
  );

  const remove = useCallback((eventId: string) => api.remove((t) => t.id === eventId), [api]);

  return { items, isFavourite, toggle, remove, fromEvent };
}
