import { useMemo } from 'react';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useMyPlayer } from './hooks/useMyPlayer';
import { usePlayerList } from './hooks/usePlayerList';
import { useSearch } from './hooks/useSearch';
import { getInitials } from './player-shared';
import { getFollowedPlayerIds, getPlayersTabMode } from './players-tab-model';
import {
  AppSearchInput,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  ListItem,
  PageSection,
  Pill,
  SearchToolbar,
} from './ui/appkit';

interface PlayersTabContentProps {
  onOpenPlayer: (playerId: string) => void;
}

const PAGE_SIZE = 10;

export function PlayersTabContent({ onOpenPlayer }: PlayersTabContentProps) {
  const search = useSearch({ minLength: 3, resetOnDisable: false });
  const { player: myPlayer } = useMyPlayer();
  const { players: favouritePlayers, isFavourite, toggle: toggleFavourite } = useFavouritePlayers();
  const mode = getPlayersTabMode(search.normalizedQuery);
  const followedIds = useMemo(
    () => getFollowedPlayerIds(favouritePlayers, myPlayer?.id),
    [favouritePlayers, myPlayer?.id],
  );

  const followingList = usePlayerList({
    search: '',
    leagueIds: [],
    savedIds: followedIds,
    pageSize: PAGE_SIZE,
    enabled: mode === 'following' && followedIds.length > 0,
  });

  const searchList = usePlayerList({
    search: search.debouncedQuery,
    leagueIds: [],
    savedIds: [],
    pageSize: PAGE_SIZE,
    enabled: mode === 'search' && search.isReady,
  });

  const visibleFollowedPlayers = followingList.items.filter(
    (player) => player.id !== myPlayer?.id && isFavourite(player.id),
  );

  const renderRows = (players: typeof searchList.items) => (
    <DesignList density="compact" divider="hairline" paginate={false}>
      {players.map((player) => (
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
  );

  const renderFollowing = () => {
    if (followedIds.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-heart-o"
          title="No followed players yet"
          message="Search for any player above, then tap the heart to follow them here."
        />
      );
    }
    if (followingList.error && visibleFollowedPlayers.length === 0) {
      return <ErrorState message={followingList.error} onRetry={() => void followingList.retry()} />;
    }
    if (followingList.isLoadingInitial) {
      return <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading followed players…" />;
    }
    if (visibleFollowedPlayers.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-heart-o"
          title="Followed players unavailable"
          message="These saved player profiles could not be found right now."
        />
      );
    }

    return (
      <>
        {renderRows(visibleFollowedPlayers)}
        <InfiniteListFooter
          hasMore={followingList.hasMore}
          isLoading={followingList.isLoadingMore}
          autoLoad={!followingList.error}
          onLoadMore={followingList.loadMore}
          loadLabel={followingList.error ? 'Retry loading followed players' : 'Load more followed players'}
          loadingLabel="Loading more followed players…"
          endLabel={`All ${visibleFollowedPlayers.length} followed players shown`}
        />
      </>
    );
  };

  const renderSearchResults = () => {
    if (!search.isReady || searchList.isLoadingInitial) {
      return <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading players…" />;
    }
    if (searchList.error && searchList.items.length === 0) {
      return <ErrorState message={searchList.error} onRetry={() => void searchList.retry()} />;
    }
    if (searchList.items.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-search"
          title="No players found"
          message={`No players match “${search.normalizedQuery}”.`}
        />
      );
    }

    return (
      <>
        {renderRows(searchList.items)}
        <InfiniteListFooter
          hasMore={searchList.hasMore}
          isLoading={searchList.isLoadingMore}
          autoLoad={!searchList.error}
          onLoadMore={searchList.loadMore}
          loadLabel={searchList.error ? 'Retry loading players' : 'Load more players'}
          loadingLabel="Loading more players…"
          endLabel={`All ${searchList.items.length} players shown`}
        />
      </>
    );
  };

  const searchResultMeta = searchList.total === null
    ? `${searchList.items.length} shown`
    : `${searchList.items.length} of ${searchList.total}`;
  const followingMeta = `${followingList.total ?? followedIds.length} players`;

  return (
    <>
      <SearchToolbar ariaLabel="Search all players">
        <AppSearchInput
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search all players…"
          aria-label="Search all players"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
        />
      </SearchToolbar>

      {mode === 'following' && myPlayer ? (
        <PageSection surface="flat" density="compact" title="My player">
          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem
              leading={<DesignAvatar size="compact" text={getInitials(myPlayer.name)} />}
              title={myPlayer.name}
              subtitle="Your player profile"
              onClick={() => onOpenPlayer(myPlayer.id)}
              trailing={<Pill tone="accent">You</Pill>}
            />
          </DesignList>
        </PageSection>
      ) : null}

      {mode === 'following' ? (
        <PageSection
          surface="flat"
          density="compact"
          title="Following"
          meta={followedIds.length > 0 ? followingMeta : undefined}
        >
          {renderFollowing()}
        </PageSection>
      ) : null}

      {mode === 'short-query' ? (
        <PageSection surface="flat" density="compact" title="Search players">
          <EmptyState
            iconClassName="fa fa-keyboard"
            title="Type at least 3 characters"
            message="Keep typing to search every player in the system."
          />
        </PageSection>
      ) : null}

      {mode === 'search' ? (
        <PageSection
          surface="flat"
          density="compact"
          title="Search results"
          meta={searchList.items.length > 0 ? searchResultMeta : undefined}
        >
          {renderSearchResults()}
        </PageSection>
      ) : null}
    </>
  );
}
