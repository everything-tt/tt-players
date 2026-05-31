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

            <div className="list-group list-custom-small tt-h2h-result-list">
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
      </div>
    </>
  );
}
