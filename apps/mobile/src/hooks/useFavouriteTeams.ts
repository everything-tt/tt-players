import { useCallback } from 'react';
import {
  FAVOURITE_TEAMS_STORAGE_KEY,
  FAVOURITE_TEAMS_UPDATED_EVENT,
  isValidFavouriteTeam,
  type FavouriteTeam,
} from '../player-shared';
import { useLocalStorageList } from './useLocalStorageList';

export function useFavouriteTeams() {
  const [teams, api] = useLocalStorageList<FavouriteTeam>(
    FAVOURITE_TEAMS_STORAGE_KEY,
    FAVOURITE_TEAMS_UPDATED_EVENT,
    isValidFavouriteTeam,
  );

  const isFavourite = useCallback(
    (teamId: string) => teams.some((team) => team.id === teamId),
    [teams],
  );
  const toggle = useCallback(
    (team: FavouriteTeam) => api.toggle(team, (item) => item.id === team.id),
    [api],
  );

  return { teams, isFavourite, toggle };
}
