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
      buckets.set(key, { id: key, label, leagueIds: new Set([league.id]) });
    }
  }
  return Array.from(buckets.values())
    .map((bucket) => ({ id: bucket.id, label: bucket.label, leagueIds: Array.from(bucket.leagueIds) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function LeagueSelectionPage({
  allLeagues, isAllLeagueScope, isLeagueSelectionReady, isLeaguesLoading,
  leaguesError, selectedLeagueIds, onAddLeague, onClose, maxSelectedLeagues,
  onRemoveLeague, onSelectRegion,
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

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const orderedLeagues = useMemo(
    () => [...allLeagues].sort((a, b) => a.name.localeCompare(b.name)),
    [allLeagues],
  );
  const allLeagueIdSet = useMemo(() => new Set(orderedLeagues.map((l) => l.id)), [orderedLeagues]);
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const regionBuckets = useMemo(() => buildRegionBuckets(orderedLeagues), [orderedLeagues]);

  const selectedLeagueIdSet = useMemo(() => {
    if (isAllLeagueScope) return new Set(orderedLeagues.map((l) => l.id));
    return new Set(selectedLeagueIds.filter((id) => allLeagueIdSet.has(id)));
  }, [allLeagueIdSet, isAllLeagueScope, orderedLeagues, selectedLeagueIds]);

  const selectedLeagues = useMemo(
    () => orderedLeagues.filter((l) => selectedLeagueIdSet.has(l.id)),
    [orderedLeagues, selectedLeagueIdSet],
  );

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return orderedLeagues.filter((l) => l.name.toLowerCase().includes(normalizedQuery));
  }, [isSearching, normalizedQuery, orderedLeagues]);

  const isLoading = !isLeagueSelectionReady || isLeaguesLoading;
  const isAtSelectionLimit = selectedLeagueIdSet.size >= maxSelectedLeagues;
  const selectedCount = selectedLeagueIdSet.size;

  const tabs: { id: PickerTab; label: string; badge?: number }[] = [
    { id: 'selected', label: 'Selected', badge: selectedCount },
    { id: 'leagues', label: 'Leagues' },
    { id: 'areas', label: 'Areas' },
  ];

  const filteredSelected = isSearching
    ? selectedLeagues.filter((l) => l.name.toLowerCase().includes(normalizedQuery))
    : selectedLeagues;

  const filteredRegions = isSearching
    ? regionBuckets.filter((r) => r.label.toLowerCase().includes(normalizedQuery))
    : regionBuckets;

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div className="menu menu-box-bottom rounded-m menu-active" style={{ height: '72%', zIndex: 999 }}>
        <div className="tt-picker-shell">
          <div className="tt-picker-top">
            <div className="d-flex mb-3">
              <h4 className="mb-0 font-16">Leagues</h4>
              <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="tt-picker-close">
                <i className="fa fa-times-circle font-20" />
              </a>
            </div>

            <div className="search-box search-dark rounded-pill border-0 bg-theme mb-3">
              <i className="fa fa-search ms-1" />
              <input
                type="text"
                className="border-0"
                placeholder={activeTab === 'selected' ? 'Filter selected...' : activeTab === 'leagues' ? 'Search leagues...' : 'Search areas...'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
          </div>

          <div className="tt-picker-body">
            {activeTab === 'selected' ? (
              filteredSelected.length === 0 ? (
                <p className="tt-picker-empty">
                  {isSearching ? 'No selected leagues match your filter.' : 'No leagues selected. Switch to Leagues or Areas tab to add leagues.'}
                </p>
              ) : (
                filteredSelected.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    className="tt-league-picker-row"
                    onClick={() => onRemoveLeague(league.id)}
                  >
                    <div className="tt-league-picker-row-content">
                      <span className="tt-league-picker-row-name">{league.name}</span>
                      <span className="tt-league-picker-row-meta">
                        {leagueRegionLabels(league).join(' · ')}
                        {leagueRegionLabels(league).length > 0 ? ' · ' : ''}
                        {league.divisions.length} divisions
                      </span>
                    </div>
                  </button>
                ))
              )
            ) : null}

            {activeTab === 'leagues' ? (
              isLoading ? (
                <p className="tt-picker-empty">Loading leagues...</p>
              ) : leaguesError ? (
                <p className="tt-picker-empty" style={{ color: '#C44339' }}>Failed to load leagues</p>
              ) : !isSearching ? (
                <p className="tt-picker-empty">Search to find leagues by name.</p>
              ) : searchResults.length === 0 ? (
                <p className="tt-picker-empty">No leagues match "{query}"</p>
              ) : (
                searchResults.map((league) => {
                  const isSelected = selectedLeagueIdSet.has(league.id);
                  const blocked = !isSelected && isAtSelectionLimit;
                  return (
                    <button
                      key={league.id}
                      type="button"
                      className={`tt-league-picker-row ${isSelected ? 'selected' : ''} ${blocked ? 'tt-picker-row-disabled' : ''}`}
                      onClick={() => { if (blocked) return; isSelected ? onRemoveLeague(league.id) : onAddLeague(league.id); }}
                    >
                      <span className={`tt-league-picker-check ${isSelected ? 'checked' : ''}`}>
                        {isSelected ? '✓' : ''}
                      </span>
                      <div className="tt-league-picker-row-content">
                        <span className="tt-league-picker-row-name">{league.name}</span>
                        <span className="tt-league-picker-row-meta">{league.divisions.length} divisions</span>
                      </div>
                    </button>
                  );
                })
              )
            ) : null}

            {activeTab === 'areas' ? (
              regionBuckets.length === 0 ? (
                <p className="tt-picker-empty">No regions available.</p>
              ) : filteredRegions.length === 0 ? (
                <p className="tt-picker-empty">No regions match your search.</p>
              ) : (
                filteredRegions.map((region) => {
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
                    </button>
                  );
                })
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
