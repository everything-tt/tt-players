import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueWithDivisions } from './player-shared';
import { BottomSheet, Checkbox, EmptyState, ErrorState, List, ListItem, Pill, SegmentedToggle } from './ui/appkit';

type RegionBucket = { id: string; label: string; leagueIds: string[] };
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
  requireSelection?: boolean;
  maxSelectedLeagues: number;
  onRemoveLeague: (leagueId: string) => void;
  onSelectRegion: (leagueIds: string[]) => void;
}

function leagueRegionLabels(league: LeagueWithDivisions): string[] {
  return (league.regions ?? []).map((region) => region.name.trim()).filter(Boolean);
}
function leagueSeasonLabel(league: LeagueWithDivisions): string { return league.season?.trim() || 'Season unknown'; }
function buildRegionBuckets(leagues: LeagueWithDivisions[]): RegionBucket[] {
  const buckets = new Map<string, { id: string; label: string; leagueIds: Set<string> }>();
  for (const league of leagues) {
    for (const region of league.regions ?? []) {
      const label = region.name.trim();
      if (!label) continue;
      const key = region.id?.trim() || region.slug?.trim() || label.toLowerCase();
      const existing = buckets.get(key);
      if (existing) { existing.leagueIds.add(league.id); continue; }
      buckets.set(key, { id: key, label, leagueIds: new Set([league.id]) });
    }
  }
  return Array.from(buckets.values()).map((b) => ({ id: b.id, label: b.label, leagueIds: Array.from(b.leagueIds) })).sort((a, b) => a.label.localeCompare(b.label));
}

export function LeagueSelectionPage({
  allLeagues, isAllLeagueScope, isLeagueSelectionReady, isLeaguesLoading,
  leaguesError, selectedLeagueIds, onAddLeague, onClose, requireSelection = false, maxSelectedLeagues,
  onRemoveLeague, onSelectRegion,
}: LeagueSelectionPageProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>(() => selectedLeagueIds.length > 0 ? 'selected' : 'areas');
  const [query, setQuery] = useState('');
  const [addedRegion, setAddedRegion] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const handleSelectRegion = (regionId: string, leagueIds: string[]) => {
    onSelectRegion(leagueIds);
    setAddedRegion(regionId);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setAddedRegion(null), 1200);
  };
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  const orderedLeagues = useMemo(() => [...allLeagues].sort((a, b) => a.name.localeCompare(b.name)), [allLeagues]);
  const allLeagueIdSet = useMemo(() => new Set(orderedLeagues.map((l) => l.id)), [orderedLeagues]);
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const regionBuckets = useMemo(() => buildRegionBuckets(orderedLeagues), [orderedLeagues]);

  const selectedLeagueIdSet = useMemo(() => {
    if (isAllLeagueScope) return new Set(orderedLeagues.map((l) => l.id));
    return new Set(selectedLeagueIds.filter((id) => allLeagueIdSet.has(id)));
  }, [allLeagueIdSet, isAllLeagueScope, orderedLeagues, selectedLeagueIds]);

  const selectedLeagues = useMemo(() => orderedLeagues.filter((l) => selectedLeagueIdSet.has(l.id)), [orderedLeagues, selectedLeagueIdSet]);
  const searchResults = useMemo(() => isSearching ? orderedLeagues.filter((l) => l.name.toLowerCase().includes(normalizedQuery)) : [], [isSearching, normalizedQuery, orderedLeagues]);
  const filteredSelected = isSearching ? selectedLeagues.filter((l) => l.name.toLowerCase().includes(normalizedQuery)) : selectedLeagues;
  const filteredRegions = isSearching ? regionBuckets.filter((r) => r.label.toLowerCase().includes(normalizedQuery)) : regionBuckets;

  const isLoading = !isLeagueSelectionReady || isLeaguesLoading;
  const isAtSelectionLimit = selectedLeagueIdSet.size >= maxSelectedLeagues;
  const selectedCount = selectedLeagueIdSet.size;
  const canClose = !requireSelection || selectedCount > 0;
  const handleClose = () => { if (canClose) onClose(); };

  const tabs = [
    { value: 'selected' as const, label: `Selected (${selectedCount})` },
    { value: 'leagues' as const, label: 'Leagues' },
    { value: 'areas' as const, label: 'Areas' },
  ];

  return (
    <BottomSheet isOpen onClose={handleClose} title="Leagues" eyebrow="League Scope" height="72%" disableBackdropClose={!canClose} disableCloseButton={!canClose}>
      <label className="tt-search-input">
        <i className="fa fa-search" aria-hidden="true" />
        <input
          type="text"
          placeholder={activeTab === 'selected' ? 'Filter selected…' : activeTab === 'leagues' ? 'Search leagues…' : 'Search areas…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search leagues or areas"
        />
        {query ? <button type="button" className="tt-search-input__clear" aria-label="Clear search" onClick={() => setQuery('')}><i className="fa fa-times-circle" /></button> : null}
      </label>

      <div className="mt-3">
        <SegmentedToggle ariaLabel="Choose league picker tab" value={activeTab} onChange={(v) => { setActiveTab(v); setQuery(''); }} options={tabs} full />
      </div>
      {requireSelection && selectedCount === 0 ? <p className="tt-picker-required">Choose at least one league to start.</p> : null}

      <div className="mt-3">
        {activeTab === 'selected' ? (
          filteredSelected.length === 0 ? (
            <EmptyState title={isSearching ? 'No selected leagues match' : 'No leagues selected'} message={isSearching ? 'Try a different filter.' : 'Switch to Leagues or Areas to add leagues.'} />
          ) : (
            <List divider="hairline">
              {filteredSelected.map((league) => (
                <ListItem key={league.id} title={league.name} subtitle={`${leagueSeasonLabel(league)} · ${leagueRegionLabels(league).join(' · ')} · ${league.divisions.length} divisions`} trailing={<Pill tone="danger">Remove</Pill>} onClick={() => onRemoveLeague(league.id)} hideChevron />
              ))}
            </List>
          )
        ) : null}

        {activeTab === 'leagues' ? (
          isLoading ? <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading leagues…" />
          : leaguesError ? <ErrorState message="Failed to load leagues" />
          : !isSearching ? <EmptyState iconClassName="fa fa-search" title="Search leagues" message="Search to find leagues by name." />
          : searchResults.length === 0 ? <EmptyState iconClassName="fa fa-search" title="No leagues found" message={`No leagues matching “${query}”.`} />
          : (
            <List divider="hairline">
              {searchResults.map((league) => {
                const isSelected = selectedLeagueIdSet.has(league.id);
                const blocked = !isSelected && isAtSelectionLimit;
                return (
                  <ListItem
                    key={league.id}
                    leading={<Checkbox checked={isSelected} />}
                    title={league.name}
                    subtitle={`${leagueSeasonLabel(league)} · ${leagueRegionLabels(league).join(' · ')} · ${league.divisions.length} divisions`}
                    disabled={blocked}
                    active={isSelected}
                    onClick={() => { if (!blocked) (isSelected ? onRemoveLeague(league.id) : onAddLeague(league.id)); }}
                    hideChevron
                  />
                );
              })}
            </List>
          )
        ) : null}

        {activeTab === 'areas' ? (
          regionBuckets.length === 0 ? <EmptyState title="No areas available" />
          : filteredRegions.length === 0 ? <EmptyState title="No areas found" message="No areas match your search." />
          : (
            <List divider="hairline">
              {filteredRegions.map((region) => {
                const justAdded = addedRegion === region.id;
                return (
                  <ListItem key={region.id} leading={<Checkbox checked={justAdded} />} title={region.label} subtitle={`${region.leagueIds.length} leagues`} active={justAdded} onClick={() => handleSelectRegion(region.id, region.leagueIds)} hideChevron />
                );
              })}
            </List>
          )
        ) : null}
      </div>
    </BottomSheet>
  );
}
