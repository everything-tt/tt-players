import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueWithDivisions } from './player-shared';

type RegionBucket = {
  id: string;
  label: string;
  leagueIds: string[];
};

type PickerTab = 'selected' | 'leagues' | 'areas';

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
  const [activeTab, setActiveTab] = useState<PickerTab>('selected');
  const [query, setQuery] = useState('');
  const [addedRegion, setAddedRegion] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const handleSelectRegion = (regionId: string, leagueIds: string[]) => {
    onSelectRegion(leagueIds);
    setAddedRegion(regionId);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setAddedRegion(null), 1200);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

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

  const searchResults = useMemo(() => {
    if (!isSearching) return orderedLeagues;
    return orderedLeagues.filter((league) =>
      league.name.toLowerCase().includes(normalizedQuery)
    );
  }, [isSearching, normalizedQuery, orderedLeagues]);

  const isLoading = !isLeagueSelectionReady || isLeaguesLoading;
  const isAtSelectionLimit = selectedLeagueIdSet.size >= maxSelectedLeagues;
  const selectedCount = selectedLeagueIdSet.size;

  const tabs: { id: PickerTab; label: string; badge?: number }[] = [
    { id: 'selected', label: 'Selected', badge: selectedCount },
    { id: 'leagues', label: 'Leagues' },
    { id: 'areas', label: 'Areas' },
  ];

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div
        className="menu menu-box-bottom rounded-m menu-active"
        style={{ height: '72%', zIndex: 999 }}
      >
        <div className="content mb-0">
          <div className="d-flex mb-2">
            <div className="align-self-center">
              <h4 className="mb-0 font-16">Leagues</h4>
            </div>
            <div className="ms-auto align-self-center">
              <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="color-theme">
                <i className="fa fa-times-circle font-20" />
              </a>
            </div>
          </div>

          <div className="search-box search-dark rounded-pill border-0 bg-theme mb-2">
            <i className="fa fa-search ms-1" />
            <input
              type="text"
              className="border-0"
              placeholder={activeTab === 'selected' ? 'Filter selected...' : activeTab === 'leagues' ? 'Search leagues...' : 'Search areas...'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="tt-picker-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tt-picker-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.id); setQuery(''); }}
              >
                {tab.label}
                {tab.badge !== undefined ? (
                  <span className="tt-picker-tab-badge">{tab.badge}</span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === 'selected' ? (
            <div className="mt-3">
              {(isSearching ? selectedLeagues.filter(l => l.name.toLowerCase().includes(normalizedQuery)) : selectedLeagues).length === 0 ? (
                <p className="text-center py-4 opacity-40 font-13">No leagues selected. Switch to Leagues tab to find and add leagues.</p>
              ) : (
                <div className="tt-selected-league-list">
                  {(isSearching ? selectedLeagues.filter(l => l.name.toLowerCase().includes(normalizedQuery)) : selectedLeagues).map((league) => (
                    <button
                      key={league.id}
                      type="button"
                      className="tt-selected-league-row"
                      onClick={() => onRemoveLeague(league.id)}
                    >
                      <span className="tt-selected-league-row-name">{league.name}</span>
                      <span className="tt-selected-league-row-meta">
                        {leagueRegionLabels(league).join(' · ')}
                        {leagueRegionLabels(league).length > 0 ? ' · ' : ''}
                        {league.divisions.length} divisions
                      </span>
                      <i className="fa fa-times-circle color-theme" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'leagues' ? (
            <div className="mt-2">
              {isLoading ? (
                <p className="text-center py-4 opacity-60 font-13">Loading leagues...</p>
              ) : leaguesError ? (
                <p className="text-center py-4 color-red-dark font-13">Failed to load leagues</p>
              ) : !isSearching ? (
                <p className="text-center py-4 opacity-40 font-13">Search to find leagues</p>
              ) : searchResults.length === 0 ? (
                <p className="text-center py-4 opacity-50 font-13">No leagues match "{query}"</p>
              ) : (
                <div className="tt-league-picker-results" style={{ maxHeight: 'calc(72vh - 220px)', overflowY: 'auto' }}>
                  {searchResults.map((league) => {
                    const isSelected = selectedLeagueIdSet.has(league.id);
                    const blocked = !isSelected && isAtSelectionLimit;

                    return (
                      <button
                        key={league.id}
                        type="button"
                        className={`tt-league-picker-row ${isSelected ? 'selected' : ''} ${blocked ? 'tt-picker-row-disabled' : ''}`}
                        onClick={() => {
                          if (blocked) return;
                          isSelected ? onRemoveLeague(league.id) : onAddLeague(league.id);
                        }}
                      >
                        <span className={`tt-league-picker-check ${isSelected ? 'checked' : ''}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <div className="tt-league-picker-row-content">
                          <span className="tt-league-picker-row-name">{league.name}</span>
                          <span className="tt-league-picker-row-meta">
                            {league.divisions.length} divisions
                          </span>
                        </div>
                        {blocked ? (
                          <span className="font-12 opacity-40">Limit reached</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'areas' ? (
            <div className="mt-2">
              {regionBuckets.length === 0 ? (
                <p className="text-center py-4 opacity-50 font-13">No regions available.</p>
              ) : (
                <div className="tt-league-picker-results" style={{ maxHeight: 'calc(72vh - 220px)', overflowY: 'auto' }}>
                  {(isSearching ? regionBuckets.filter(r => r.label.toLowerCase().includes(normalizedQuery)) : regionBuckets).map((region) => {
                    const justAdded = addedRegion === region.id;
                    return (
                      <button
                        key={region.id}
                        type="button"
                        className={`tt-league-picker-row ${justAdded ? 'tt-region-added' : ''}`}
                        onClick={() => handleSelectRegion(region.id, region.leagueIds)}
                      >
                        <span className={`tt-league-picker-check ${justAdded ? 'checked' : ''}`}>
                          {justAdded ? '✓' : ''}
                        </span>
                        <div className="tt-league-picker-row-content">
                          <span className="tt-league-picker-row-name">{region.label}</span>
                          <span className="tt-league-picker-row-meta">{region.leagueIds.length} leagues</span>
                        </div>
                        <span className="tt-region-add-label">
                          {justAdded ? 'Added' : 'Add all'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
