import { useEffect, useState } from 'react';
import {
  type PlayerSearchItem,
} from './player-shared';
import { usePlayerSearchQuery } from './queries';

import { PlayerList } from './components/PlayerList';

const SEARCH_DEBOUNCE_MS = 250;

interface PlayerSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (player: PlayerSearchItem) => void;
  excludePlayerId?: string;
  title?: string;
}

export function PlayerSearchSheet({
  isOpen,
  onClose,
  onSelect,
  excludePlayerId,
  title = 'Search Player',
}: PlayerSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setDebouncedQuery('');
      return;
    }
  }, [isOpen]);

  const normalizedQuery = query.trim();

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedQuery(isOpen && normalizedQuery.length > 2 ? normalizedQuery : '');
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [normalizedQuery, isOpen]);

  const searchQuery = usePlayerSearchQuery(debouncedQuery, [], {
    enabled: isOpen && debouncedQuery.length > 2,
  });
  const isLoading = searchQuery.isLoading;
  const error = searchQuery.error instanceof Error ? searchQuery.error.message : null;
  const results = (searchQuery.data?.data ?? []).filter((item) => item.id !== excludePlayerId);

  if (!isOpen) return null;

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div
        className="menu menu-box-bottom rounded-m menu-active tt-picker-menu"
        style={{ height: '70%', zIndex: 999 }}
      >
        <div className="tt-picker-shell">
          <div className="tt-picker-top">
            <div className="tt-picker-title-row">
              <div>
                <p className="tt-picker-eyebrow">Head to Head</p>
                <h4 className="tt-picker-title">{title}</h4>
              </div>
              <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="tt-picker-close" aria-label="Close player search">
                <i className="fa fa-times-circle font-20" />
              </a>
            </div>

            <div className="search-box search-dark rounded-pill border-0 bg-theme mb-3">
              <i className="fa fa-search ms-1" />
              <input
                type="text"
                className="border-0"
                placeholder="Start typing player name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="tt-picker-body">
            {normalizedQuery.length > 0 && normalizedQuery.length <= 2 ? (
              <p className="tt-picker-empty">Type at least 3 characters.</p>
            ) : null}

            {isLoading && (
              <p className="tt-picker-empty tt-picker-loading">Searching players...</p>
            )}

            {error && <p className="tt-picker-empty tt-picker-error">{error}</p>}

            {!isLoading && normalizedQuery.length > 2 && results.length === 0 && (
              <p className="tt-picker-empty">No players found matching "{normalizedQuery}"</p>
            )}

            <PlayerList
              players={results}
              onSelectPlayer={onSelect}
              compact
            />
          </div>
        </div>
      </div>
    </>
  );
}
