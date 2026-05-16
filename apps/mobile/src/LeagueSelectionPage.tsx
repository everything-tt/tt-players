import { useMemo, useState } from 'react';
import type { LeagueWithDivisions } from './player-shared';

type RegionBucket = {
  id: string;
  label: string;
  leagueIds: string[];
};

interface LeagueSelectionPageProps {
  allLeagues: LeagueWithDivisions[];
  isAllLeagueScope: boolean;
  isLeagueSelectionReady: boolean;
  isLeaguesLoading: boolean;
  leaguesError: string | null;
  selectedLeagueIds: string[];
  onAddLeague: (leagueId: string) => void;
  onClose: () => void;
  maxSelectedLeagues: number;
  onRemoveLeague: (leagueId: string) => void;
  onSelectRegion: (leagueIds: string[]) => void;
}

function leagueRegionLabels(league: LeagueWithDivisions): string[] {
  return (league.regions ?? [])
    .map((region) => region.name.trim())
    .filter((name) => name.length > 0);
}

function buildRegionBuckets(leagues: LeagueWithDivisions[]): RegionBucket[] {
  const buckets = new Map<string, { id: string; label: string; leagueIds: Set<string> }>();

  for (const league of leagues) {
    for (const region of league.regions ?? []) {
      const label = region.name.trim();
      if (!label) continue;

      const key = region.id?.trim() || region.slug?.trim() || label.toLowerCase();
      const existing = buckets.get(key);

      if (existing) {
        existing.leagueIds.add(league.id);
        continue;
      }

      buckets.set(key, {
        id: key,
        label,
        leagueIds: new Set([league.id]),
      });
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      leagueIds: Array.from(bucket.leagueIds),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function LeagueSelectionPage({
  allLeagues,
  isAllLeagueScope,
  isLeagueSelectionReady,
  isLeaguesLoading,
  leaguesError,
  selectedLeagueIds,
  onAddLeague,
  onClose,
  maxSelectedLeagues,
  onRemoveLeague,
  onSelectRegion,
}: LeagueSelectionPageProps) {
  const [query, setQuery] = useState('');

  const orderedLeagues = useMemo(
    () => [...allLeagues].sort((a, b) => a.name.localeCompare(b.name)),
    [allLeagues],
  );

  const allLeagueIdSet = useMemo(() => new Set(orderedLeagues.map((league) => league.id)), [orderedLeagues]);
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const regionBuckets = useMemo(() => buildRegionBuckets(orderedLeagues), [orderedLeagues]);

  const selectedLeagueIdSet = useMemo(() => {
    if (isAllLeagueScope) {
      return new Set(orderedLeagues.map((league) => league.id));
    }
    return new Set(selectedLeagueIds.filter((leagueId) => allLeagueIdSet.has(leagueId)));
  }, [allLeagueIdSet, isAllLeagueScope, orderedLeagues, selectedLeagueIds]);

  const selectedLeagues = useMemo(
    () => orderedLeagues.filter((league) => selectedLeagueIdSet.has(league.id)),
    [orderedLeagues, selectedLeagueIdSet],
  );

  const leaguesById = useMemo(
    () => new Map(orderedLeagues.map((league) => [league.id, league])),
    [orderedLeagues],
  );

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return orderedLeagues.filter((league) => {
      if (league.name.toLowerCase().includes(normalizedQuery)) return true;
      return leagueRegionLabels(league).some((label) => label.toLowerCase().includes(normalizedQuery));
    });
  }, [isSearching, normalizedQuery, orderedLeagues]);

  const isLoading = !isLeagueSelectionReady || isLeaguesLoading;
  const isAtSelectionLimit = selectedLeagueIdSet.size >= maxSelectedLeagues;
  const selectedCount = selectedLeagueIdSet.size;

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div
        className="menu menu-box-bottom rounded-m menu-active"
        style={{ height: '72%', zIndex: 999 }}
      >
        <div className="content mb-0">
          <div className="d-flex mb-1">
            <div className="align-self-center">
              <h4 className="mb-0 font-16">Leagues</h4>
              <p className="font-12 opacity-60 mb-0">
                {selectedCount} of {orderedLeagues.length} selected
              </p>
            </div>
            <div className="ms-auto align-self-center">
              <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="color-theme">
                <i className="fa fa-times-circle font-20" />
              </a>
            </div>
          </div>

          {isAtSelectionLimit ? (
            <p className="font-12 opacity-60 mb-2">Maximum {maxSelectedLeagues} leagues.</p>
          ) : null}

          <div className="search-box search-dark rounded-pill border-0 bg-theme mb-2">
            <i className="fa fa-search ms-1" />
            <input
              type="text"
              className="border-0"
              placeholder="Search leagues or regions..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>

          {!isSearching && regionBuckets.length > 0 ? (
            <div className="tt-region-chip-grid mb-3">
              {regionBuckets.map((region) => {
                const selectedInRegion = region.leagueIds
                  .filter((leagueId) => selectedLeagueIdSet.has(leagueId)).length;
                const allRegionSelected = selectedInRegion === region.leagueIds.length;

                return (
                  <button
                    key={region.id}
                    type="button"
                    className={`tt-region-chip ${allRegionSelected ? 'active' : ''}`}
                    onClick={() => onSelectRegion(region.leagueIds)}
                  >
                    <span className="tt-region-chip-name">{region.label}</span>
                    <span className="tt-region-chip-meta">{selectedInRegion}/{region.leagueIds.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedLeagues.length > 0 && !isSearching ? (
            <div className="mb-3">
              <p className="font-12 font-600 text-uppercase opacity-50 mb-2" style={{ letterSpacing: '0.06em' }}>Selected</p>
              <div className="tt-selected-league-pills">
                {selectedLeagues.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    className="tt-selected-league-pill"
                    onClick={() => onRemoveLeague(league.id)}
                  >
                    <span>{league.name}</span>
                    <i className="fa fa-times" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isSearching ? (
            isLoading ? (
              <p className="text-center py-4 opacity-60 font-13">Loading...</p>
            ) : leaguesError ? (
              <p className="text-center py-4 color-red-dark font-13">Failed to load leagues</p>
            ) : searchResults.length === 0 ? (
              <p className="text-center py-4 opacity-50 font-13">No leagues match "{query}"</p>
            ) : (
              <div className="tt-league-picker-results" style={{ maxHeight: 'calc(72vh - 260px)', overflowY: 'auto' }}>
                {searchResults.map((league) => {
                  const isSelected = selectedLeagueIdSet.has(league.id);
                  const regionLabels = leagueRegionLabels(league);

                  return (
                    <button
                      key={league.id}
                      type="button"
                      className={`tt-league-picker-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => (isSelected ? onRemoveLeague(league.id) : onAddLeague(league.id))}
                    >
                      <span className={`tt-league-picker-check ${isSelected ? 'checked' : ''}`}>
                        {isSelected ? '✓' : ''}
                      </span>
                      <div className="tt-league-picker-row-content">
                        <span className="tt-league-picker-row-name">{league.name}</span>
                        <span className="tt-league-picker-row-meta">
                          {regionLabels.length > 0 ? `${regionLabels.join(' · ')} · ` : ''}
                          {league.divisions.length} divisions
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
