import { useCallback } from 'react';
import { useLocalStorageList } from './useLocalStorageList';
import {
  FAVOURITES_STORAGE_KEY,
  FAVOURITES_UPDATED_EVENT,
  isValidFavouritePlayer,
  type FavouritePlayer,
} from '../player-shared';

/**
 * Reactive favourite-players list. Single implementation consumed by
 * App.tsx (search/favourites), PlayerPage, and anywhere else that needs it.
 * Replaces the inline parse/persist/sync copies that lived in each file.
 */
export function useFavouritePlayers() {
  const [players, api] = useLocalStorageList<FavouritePlayer>(
    FAVOURITES_STORAGE_KEY,
    FAVOURITES_UPDATED_EVENT,
    isValidFavouritePlayer,
  );

  const isFavourite = useCallback(
    (playerId: string) => players.some((p) => p.id === playerId),
    [players],
  );

  const toggle = useCallback(
    (player: FavouritePlayer) => api.toggle(player, (p) => p.id === player.id),
    [api],
  );

  const remove = useCallback(
    (playerId: string) => api.remove((p) => p.id === playerId),
    [api],
  );

  return {
    players,
    isFavourite,
    toggle,
    remove,
    set: api.set,
    add: api.add,
    has: api.has,
    clear: api.clear,
  };
}

