import { useDeferredValue, useMemo, useState } from 'react';
import type { LeagueWithDivisions } from './player-shared';
import {
  AppButton,
  AppSearchInput,
  BottomSheet,
  Checkbox,
  EmptyState,
  ErrorState,
  List,
  ListItem,
  SectionHeader,
  SegmentedToggle,
} from './ui/appkit';

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

function leagueSeasonLabel(league: LeagueWithDivisions): string {
  return league.season?.trim() || 'Season unknown';
}

function leagueSubtitle(league: LeagueWithDivisions): string {
  const regions = leagueRegionLabels(league);
  return [
    leagueSeasonLabel(league),
    regions.length > 0 ? regions.join(' · ') : null,
    `${league.divisions.length} ${league.divisions.length === 1 ? 'division' : 'divisions'}`,
  ].filter(Boolean).join(' · ');
}

function leagueSearchText(league: LeagueWithDivisions): string {
  return [
    league.name,
    league.platform,
    league.season,
    ...leagueRegionLabels(league),
    ...league.divisions.map((division) => division.name),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function buildRegionBuckets(leagues: LeagueWithDivisions[]): RegionBucket[] {
  const buckets = new Map<string, { id: string; label: string; leagueIds: Set<string> }>();
  for (const league of leagues) {
    for (const region of league.regions ?? []) {
      const label = region.name.trim();
      if (!label) continue;
      const key = region.id?.trim() || region.slug?.trim() || label.toLocaleLowerCase();
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
    .sort((left, right) => left.label.localeCompare(right.label));
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
  requireSelection = false,
  maxSelectedLeagues,
  onRemoveLeague,
  onSelectRegion,
}: LeagueSelectionPageProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>(() => selectedLeagueIds.length > 0 ? 'selected' : 'leagues');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const orderedLeagues = useMemo(
    () => [...allLeagues].sort((left, right) => left.name.localeCompare(right.name)),
    [allLeagues],
  );
  const allLeagueIdSet = useMemo(() => new Set(orderedLeagues.map((league) => league.id)), [orderedLeagues]);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const regionBuckets = useMemo(() => buildRegionBuckets(orderedLeagues), [orderedLeagues]);

  const selectedLeagueIdSet = useMemo(() => {
    if (isAllLeagueScope) return new Set(orderedLeagues.map((league) => league.id));
    return new Set(selectedLeagueIds.filter((id) => allLeagueIdSet.has(id)));
  }, [allLeagueIdSet, isAllLeagueScope, orderedLeagues, selectedLeagueIds]);

  const selectedLeagues = useMemo(
    () => orderedLeagues.filter((league) => selectedLeagueIdSet.has(league.id)),
    [orderedLeagues, selectedLeagueIdSet],
  );

  const filteredLeagues = useMemo(() => {
    if (!normalizedQuery) return orderedLeagues;
    return orderedLeagues.filter((league) => leagueSearchText(league).includes(normalizedQuery));
  }, [normalizedQuery, orderedLeagues]);

  const filteredSelected = useMemo(() => {
    if (!normalizedQuery) return selectedLeagues;
    return selectedLeagues.filter((league) => leagueSearchText(league).includes(normalizedQuery));
  }, [normalizedQuery, selectedLeagues]);

  const filteredRegions = useMemo(() => {
    if (!normalizedQuery) return regionBuckets;
    return regionBuckets.filter((region) => region.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, regionBuckets]);

  const isLoading = !isLeagueSelectionReady || isLeaguesLoading;
  const isAtSelectionLimit = selectedLeagueIdSet.size >= maxSelectedLeagues;
  const selectedCount = selectedLeagueIdSet.size;
  const canClose = !requireSelection || selectedCount > 0;
  const handleClose = () => { if (canClose) onClose(); };

  const clearSelection = () => {
    for (const league of selectedLeagues) onRemoveLeague(league.id);
  };

  const toggleRegion = (region: RegionBucket) => {
    const isFullySelected = region.leagueIds.every((leagueId) => selectedLeagueIdSet.has(leagueId));
    if (isFullySelected) {
      for (const leagueId of region.leagueIds) onRemoveLeague(leagueId);
      return;
    }
    onSelectRegion(region.leagueIds);
  };

  const tabs = [
    { value: 'selected' as const, label: `Selected (${selectedCount})` },
    { value: 'leagues' as const, label: 'Leagues' },
    { value: 'areas' as const, label: 'Areas' },
  ];

  const footerStatus = requireSelection && selectedCount === 0
    ? 'Choose at least one league to continue.'
    : selectedCount >= maxSelectedLeagues
      ? `Maximum of ${maxSelectedLeagues} leagues selected.`
      : `${selectedCount} of ${maxSelectedLeagues} leagues selected.`;

  return (
    <BottomSheet
      isOpen
      onClose={handleClose}
      presentation="page"
      title="League scope"
      description="Choose the leagues and areas included across Players, Leagues and Home."
      className="tt-league-scope"
      disableBackdropClose={!canClose}
      disableCloseButton={!canClose}
      footer={(
        <div className="tt-league-scope__footer">
          <p className="tt-league-scope__selection-summary" aria-live="polite">{footerStatus}</p>
          <AppButton size="l" rounded="m" onClick={handleClose} disabled={!canClose}>Done</AppButton>
        </div>
      )}
    >
      <div className="tt-league-scope__controls">
        <div className="tt-league-scope__search">
          <AppSearchInput
            containerClassName="tt-league-scope__search-input"
            placeholder="Search leagues or areas"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            aria-label="Search leagues or areas"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              className="tt-league-scope__clear-search"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <i className="fa fa-times-circle" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <SegmentedToggle
          ariaLabel="Choose league scope tab"
          value={activeTab}
          onChange={setActiveTab}
          options={tabs}
          full
        />
      </div>

      <div className="tt-league-scope__content">
        {isLoading ? (
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading leagues…" />
        ) : leaguesError ? (
          <ErrorState message={leaguesError} />
        ) : (
          <>
            {activeTab === 'selected' ? (
              <section aria-labelledby="league-scope-selected-heading">
                <SectionHeader
                  title={<span id="league-scope-selected-heading">Selected leagues</span>}
                  description={isSearching ? `${filteredSelected.length} matching selection` : 'Included throughout the app'}
                  action={selectedCount > 0 && !requireSelection ? (
                    <AppButton tone="ghost" size="s" onClick={clearSelection}>Clear selection</AppButton>
                  ) : undefined}
                  density="compact"
                />
                {filteredSelected.length === 0 ? (
                  <EmptyState
                    title={isSearching ? 'No selected leagues match' : 'No leagues selected'}
                    message={isSearching ? 'Try another search term.' : 'Use Leagues or Areas to build your scope.'}
                  />
                ) : (
                  <List className="tt-league-scope__list" divider="hairline">
                    {filteredSelected.map((league) => (
                      <ListItem
                        key={league.id}
                        title={league.name}
                        subtitle={leagueSubtitle(league)}
                        trailing={(
                          <AppButton
                            tone="ghost"
                            size="s"
                            className="tt-picker-remove"
                            onClick={() => onRemoveLeague(league.id)}
                            aria-label={`Remove ${league.name}`}
                          >
                            <i className="fa fa-times" aria-hidden="true" />
                            <span>Remove</span>
                          </AppButton>
                        )}
                        hideChevron
                      />
                    ))}
                  </List>
                )}
              </section>
            ) : null}

            {activeTab === 'leagues' ? (
              <section aria-labelledby="league-scope-leagues-heading">
                <SectionHeader
                  title={<span id="league-scope-leagues-heading">All leagues</span>}
                  description={isSearching
                    ? `${filteredLeagues.length} ${filteredLeagues.length === 1 ? 'result' : 'results'} for “${deferredQuery.trim()}”`
                    : `${orderedLeagues.length} available`}
                  density="compact"
                />
                {filteredLeagues.length === 0 ? (
                  <EmptyState
                    iconClassName="fa fa-search"
                    title="No leagues found"
                    message={`No leagues match “${query.trim()}”. Try a league, season or area name.`}
                  />
                ) : (
                  <List className="tt-league-scope__list" divider="hairline">
                    {filteredLeagues.map((league) => {
                      const isSelected = selectedLeagueIdSet.has(league.id);
                      const isBlocked = !isSelected && isAtSelectionLimit;
                      return (
                        <ListItem
                          key={league.id}
                          leading={<Checkbox checked={isSelected} />}
                          title={league.name}
                          subtitle={leagueSubtitle(league)}
                          disabled={isBlocked}
                          active={isSelected}
                          onClick={() => {
                            if (isBlocked) return;
                            if (isSelected) onRemoveLeague(league.id);
                            else onAddLeague(league.id);
                          }}
                          hideChevron
                        />
                      );
                    })}
                  </List>
                )}
              </section>
            ) : null}

            {activeTab === 'areas' ? (
              <section aria-labelledby="league-scope-areas-heading">
                <SectionHeader
                  title={<span id="league-scope-areas-heading">Areas</span>}
                  description={isSearching
                    ? `${filteredRegions.length} ${filteredRegions.length === 1 ? 'result' : 'results'}`
                    : 'Select or clear every league in an area'}
                  density="compact"
                />
                {filteredRegions.length === 0 ? (
                  <EmptyState
                    iconClassName="fa fa-map-marker-alt"
                    title={regionBuckets.length === 0 ? 'No areas available' : 'No areas found'}
                    message={regionBuckets.length === 0 ? undefined : 'No areas match your search.'}
                  />
                ) : (
                  <List className="tt-league-scope__list" divider="hairline">
                    {filteredRegions.map((region) => {
                      const selectedInRegion = region.leagueIds.filter((leagueId) => selectedLeagueIdSet.has(leagueId)).length;
                      const isFullySelected = selectedInRegion === region.leagueIds.length;
                      const isBlocked = !isFullySelected && isAtSelectionLimit;
                      return (
                        <ListItem
                          key={region.id}
                          leading={<Checkbox checked={isFullySelected} />}
                          title={region.label}
                          subtitle={`${selectedInRegion} of ${region.leagueIds.length} leagues selected`}
                          active={isFullySelected}
                          disabled={isBlocked}
                          onClick={() => toggleRegion(region)}
                          hideChevron
                        />
                      );
                    })}
                  </List>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
