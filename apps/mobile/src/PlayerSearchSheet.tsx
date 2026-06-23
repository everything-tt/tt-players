import {
  type PlayerSearchItem,
} from './player-shared';
import { usePlayerSearchQuery } from './queries';
import { useSearch } from './hooks/useSearch';
import { getQueryError } from './player-shared';

import { BottomSheet, EmptyState, ErrorState, List, ListItem, Avatar } from './ui/appkit';

const SEARCH_DEBOUNCE_MS = 250;

interface PlayerSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (player: PlayerSearchItem) => void;
  excludePlayerId?: string;
  title?: string;
}

/**
 * H2H player picker. Now built on the shared BottomSheet + useSearch + List
 * primitives. Replaces the hand-rolled debounce, search-box, and result list.
 */
export function PlayerSearchSheet({
  isOpen,
  onClose,
  onSelect,
  excludePlayerId,
  title = 'Select Player',
}: PlayerSearchSheetProps) {
  const search = useSearch({ minLength: 3, debounceMs: SEARCH_DEBOUNCE_MS, enabled: isOpen });
  const { debouncedQuery, normalizedQuery, query, setQuery, isReady } = search;

  const searchQuery = usePlayerSearchQuery(debouncedQuery, [], {
    enabled: isOpen && isReady,
  });
  const isLoading = searchQuery.isLoading;
  const error = getQueryError(searchQuery.error);
  const results = (searchQuery.data?.data ?? []).filter((item) => item.id !== excludePlayerId);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      eyebrow="Head to Head"
    >
      <label className="tt-search-input">
        <i className="fa fa-search" aria-hidden="true" />
        <input
          type="text"
          placeholder="Start typing player name…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search players"
        />
        {query ? (
          <button type="button" className="tt-search-input__clear" onClick={() => setQuery('')} aria-label="Clear search">
            <i className="fa fa-times-circle" />
          </button>
        ) : null}
      </label>

      <div className="mt-3" aria-live="polite">
        {!isReady && normalizedQuery.length > 0 ? (
          <EmptyState iconClassName="fa fa-keyboard" title="Type at least 3 characters" message="Start typing to search players." />
        ) : isLoading ? (
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Searching players…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : isReady && results.length === 0 ? (
          <EmptyState iconClassName="fa fa-search" title="No players found" message={`No players matching “${normalizedQuery}”.`} />
        ) : (
          <List>
            {results.map((player) => (
              <ListItem
                key={player.id}
                leading={<Avatar text={player.name.slice(0, 2).toUpperCase()} variant="subtle" />}
                title={player.name}
                subtitle={`${player.wins}W · ${player.played} played`}
                onClick={() => onSelect(player)}
              />
            ))}
          </List>
        )}
      </div>
    </BottomSheet>
  );
}
