import { useMemo, useState } from 'react';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { usePlayerList } from './hooks/usePlayerList';
import { useSearch } from './hooks/useSearch';
import { getInitials } from './player-shared';
import {
  AppSearchInput,
  AppToggleButton,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  ListItem,
  PageSection,
  SearchToolbar,
  SegmentedToggle,
} from './ui/appkit';

type PlayerScope = 'all' | 'selected';

interface PlayersTabContentProps {
  selectedLeagueIds: string[];
  allLeaguesCount: number;
  onOpenLeagueSelector: () => void;
  onOpenPlayer: (playerId: string) => void;
}

const PAGE_SIZE = 10;

export function PlayersTabContent({
  selectedLeagueIds,
  allLeaguesCount,
  onOpenLeagueSelector,
  onOpenPlayer,
}: PlayersTabContentProps) {
  const [scope, setScope] = useState<PlayerScope>('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const search = useSearch({ minLength: 3, resetOnDisable: false });
  const { players: favouritePlayers, isFavourite, toggle: toggleFavourite } = useFavouritePlayers();
  const favouriteIds = useMemo(
    () => savedOnly ? favouritePlayers.map((player) => player.id) : [],
    [favouritePlayers, savedOnly],
  );
  const noSavedPlayers = savedOnly && favouritePlayers.length === 0;
  const effectiveSearch = search.normalizedQuery.length === 0 ? '' : search.debouncedQuery;
  const mayFetch = !search.isTooShort && !noSavedPlayers;

  const allPlayers = usePlayerList({
    search: effectiveSearch,
    leagueIds: [],
    savedIds: favouriteIds,
    allLeaguesCount,
    pageSize: PAGE_SIZE,
    enabled: scope === 'all' && mayFetch,
  });
  const selectedPlayers = usePlayerList({
    search: effectiveSearch,
    leagueIds: selectedLeagueIds,
    savedIds: favouriteIds,
    allLeaguesCount,
    pageSize: PAGE_SIZE,
    enabled: scope === 'selected' && selectedLeagueIds.length > 0 && mayFetch,
  });
  const list = scope === 'all' ? allPlayers : selectedPlayers;

  const emptyState = () => {
    if (scope === 'selected' && selectedLeagueIds.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-filter"
          title="Choose leagues first"
          message="Select the leagues whose players you want to browse and search."
          action={{ label: 'Choose leagues', onClick: onOpenLeagueSelector }}
        />
      );
    }
    if (search.isTooShort) {
      return (
        <EmptyState
          iconClassName="fa fa-keyboard"
          title="Type at least 3 characters"
          message="Keep typing to search players, or clear the field to browse recent players."
        />
      );
    }
    if (noSavedPlayers) {
      return (
        <EmptyState
          iconClassName="fa fa-heart-o"
          title="No saved players"
          message="Turn off Saved, then use the heart beside a player to keep them here."
        />
      );
    }
    if (list.error && list.items.length === 0) {
      return <ErrorState message={list.error} onRetry={() => void list.retry()} />;
    }
    if (list.isLoadingInitial) {
      return <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading players…" />;
    }
    if (list.items.length === 0) {
      const hasQuery = search.normalizedQuery.length >= 3;
      return (
        <EmptyState
          iconClassName={savedOnly ? 'fa fa-heart-o' : 'fa fa-search'}
          title={savedOnly ? 'No saved players found' : hasQuery ? 'No players found' : 'No recent players'}
          message={hasQuery
            ? `No players matching “${search.normalizedQuery}” in this scope.`
            : 'There are no players available in this scope yet.'}
        />
      );
    }
    return null;
  };

  const state = emptyState();

  return (
    <>
      <div className="tt-browse-controls">
        <SegmentedToggle
          ariaLabel="Player search scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All leagues' },
            { value: 'selected', label: 'Selected' },
          ]}
        />
      </div>

      <SearchToolbar
        ariaLabel="Search players"
        actions={(
          <AppToggleButton
            pressed={savedOnly}
            iconClassName={savedOnly ? 'fa fa-heart' : 'fa fa-heart-o'}
            onClick={() => setSavedOnly((current) => !current)}
            aria-label={savedOnly ? 'Show all players' : 'Show saved players only'}
          >
            Saved
          </AppToggleButton>
        )}
      >
        <AppSearchInput
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search players…"
          aria-label="Search players"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
        />
      </SearchToolbar>

      <PageSection
        surface="flat"
        density="compact"
        title={search.normalizedQuery ? 'Search results' : 'Players'}
        meta={state ? undefined : `${list.items.length} of ${list.total}`}
      >
        {state ?? (
          <>
            <DesignList density="compact" divider="hairline" paginate={false}>
              {list.items.map((player) => (
                <ListItem
                  key={player.id}
                  leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
                  title={player.name}
                  subtitle={`${player.wins}W · ${player.played}P`}
                  onClick={() => onOpenPlayer(player.id)}
                  trailing={(
                    <FavouriteButton
                      size="icon"
                      saved={isFavourite(player.id)}
                      onToggle={() => toggleFavourite(player)}
                    />
                  )}
                />
              ))}
            </DesignList>
            <InfiniteListFooter
              hasMore={list.hasMore}
              isLoading={list.isLoadingMore}
              autoLoad={!list.error}
              onLoadMore={list.loadMore}
              loadLabel={list.error ? 'Retry loading players' : 'Load more players'}
              loadingLabel="Loading more players…"
              endLabel={`All ${list.items.length} players shown`}
            />
          </>
        )}
      </PageSection>
    </>
  );
}
