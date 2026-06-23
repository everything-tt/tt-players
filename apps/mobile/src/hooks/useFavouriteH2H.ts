import { useCallback } from 'react';
import { useLocalStorageList } from './useLocalStorageList';
import {
  H2H_FAVOURITES_STORAGE_KEY,
  H2H_FAVOURITES_UPDATED_EVENT,
  type PlayerSearchItem,
} from '../player-shared';

export type FavouriteH2H = {
  player1: PlayerSearchItem;
  player2: PlayerSearchItem;
};

function isValidFavouriteH2H(value: unknown): value is FavouriteH2H {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const isPlayer = (v: unknown): boolean =>
    !!v && typeof v === 'object' &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>).name === 'string';
  return isPlayer(item.player1) && isPlayer(item.player2);
}

function samePair(a: FavouriteH2H, p1: string, p2: string): boolean {
  return (a.player1.id === p1 && a.player2.id === p2) ||
    (a.player1.id === p2 && a.player2.id === p1);
}

/** Reactive favourite head-to-head matchups. Replaces the inline copy in H2HTabContent. */
export function useFavouriteH2H() {
  const [items, api] = useLocalStorageList<FavouriteH2H>(
    H2H_FAVOURITES_STORAGE_KEY,
    H2H_FAVOURITES_UPDATED_EVENT,
    isValidFavouriteH2H,
  );

  const isFavourite = useCallback(
    (playerAId: string, playerBId: string) =>
      items.some((item) => samePair(item, playerAId, playerBId)),
    [items],
  );

  const toggle = useCallback(
    (matchup: FavouriteH2H) =>
      api.toggle(matchup, (item) => samePair(item, matchup.player1.id, matchup.player2.id)),
    [api],
  );

  const remove = useCallback(
    (playerAId: string, playerBId: string) =>
      api.remove((item) => samePair(item, playerAId, playerBId)),
    [api],
  );

  return { items, isFavourite, toggle, remove };
}
