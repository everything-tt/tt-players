import { useEffect, useState } from 'react';
import {
  apiFetch,
  getInitials,
  type PlayerSearchItem,
  type PlayerSearchResponse,
} from './player-shared';

const SEARCH_DEBOUNCE_MS = 250;

function buildPlayerSearchPath(query: string, leagueIds: string[]): string {
  const params = new URLSearchParams();
  const normalized = query.trim();
  if (normalized.length > 0) {
    params.set('q', normalized);
  }
  if (leagueIds.length > 0) {
    params.set('league_ids', leagueIds.join(','));
  }
  return params.size > 0 ? `/players/search?${params.toString()}` : '/players/search';
}

interface PlayerSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (player: PlayerSearchItem) => void;
  selectedLeagueIds: string[];
  excludePlayerId?: string;
  title?: string;
}

export function PlayerSearchSheet({
  isOpen,
  onClose,
  onSelect,
  selectedLeagueIds,
  excludePlayerId,
  title = 'Search Player',
}: PlayerSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      return;
    }
  }, [isOpen]);

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!isOpen || normalizedQuery.length <= 2) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    const timerId = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const payload = await apiFetch<PlayerSearchResponse>(
          buildPlayerSearchPath(normalizedQuery, selectedLeagueIds),
          abortController.signal,
        );
        setResults((payload.data ?? []).filter((item) => item.id !== excludePlayerId));
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setResults([]);
        setError((error as Error).message || 'Failed to search players');
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      abortController.abort();
      window.clearTimeout(timerId);
    };
  }, [normalizedQuery, isOpen, selectedLeagueIds, excludePlayerId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div
        className="menu menu-box-bottom rounded-m menu-active"
        style={{ height: '70%', zIndex: 999 }}
      >
        <div className="content mb-0">
          <div className="d-flex mb-3">
            <div className="align-self-center">
              <h4 className="mb-0">{title}</h4>
            </div>
            <div className="ms-auto align-self-center">
              <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="color-red-dark">
                <i className="fa fa-times-circle font-20" />
              </a>
            </div>
          </div>

          <div className="search-box search-dark shadow-xs border-0 bg-theme rounded-m mb-3">
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

          {normalizedQuery.length > 0 && normalizedQuery.length <= 2 ? (
            <p className="font-12 opacity-70 mb-3 text-center">Type at least 3 characters.</p>
          ) : null}

          {isLoading && (
            <div className="text-center py-4">
              <i className="fa fa-spinner fa-spin font-24 color-highlight mb-2" />
              <p className="font-12 mb-0">Searching players...</p>
            </div>
          )}

          {error && <p className="font-12 color-red-dark text-center py-3">{error}</p>}

          {!isLoading && normalizedQuery.length > 2 && results.length === 0 && (
            <div className="text-center py-4">
              <i className="fa fa-user-slash font-24 opacity-30 mb-2" />
              <p className="font-12 opacity-50 mb-0">No players found matching "{normalizedQuery}"</p>
            </div>
          )}

          <div className="list-group list-custom-small tt-h2h-result-list" style={{ maxHeight: 'calc(70vh - 180px)' }}>
            {results.map((player) => (
              <a
                key={player.id}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(player);
                }}
              >
                <i className="tt-h2h-search-avatar bg-highlight color-white">{getInitials(player.name)}</i>
                <span>{player.name}</span>
                <strong>{player.wins}W · {player.played} played</strong>
                <i className="fa fa-angle-right" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
