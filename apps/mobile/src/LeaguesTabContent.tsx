import { useEffect, useMemo, useState } from 'react';
import {
  type LeagueWithDivisions,
  getQueryError,
} from './player-shared';
import { SkeletonBlock, SkeletonList } from './components/Skeleton';
import { useLeagueSnapshotQuery, useLeaguesQuery, useStandingsQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  List,
  ListItem,
  IconCircle,
  Pill,
  SectionHeader,
  HeroCard,
  EmptyState,
  ErrorState,
  ExternalLinkButton,
} from './ui/appkit';
import { formatRecord } from './player-shared';

interface StandingsRow {
  team_id: string;
  team_name: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  drawn?: number;
  points: number;
}

interface DivisionData {
  id: string;
  name: string;
}

const CURRENT_LEAGUE_ID_KEY = 'tt_players_current_league_id';
const CURRENT_DIVISION_ID_KEY = 'tt_players_current_division_id';

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
}

export function LeaguesTabContent({ selectedLeagueIds }: LeaguesTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const leaguesQuery = useLeaguesQuery();
  const allSeasonLeagues: LeagueWithDivisions[] = leaguesQuery.data?.data ?? [];
  const isLeaguesLoading = leaguesQuery.isLoading && !leaguesQuery.data;
  const leaguesError = getQueryError(leaguesQuery.error);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_LEAGUE_ID_KEY) || '';
  });
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_DIVISION_ID_KEY) || '';
  });
  const [isLeagueChooserOpen, setIsLeagueChooserOpen] = useState(!selectedLeagueId);



  const visibleLeagues = useMemo(() => {
    if (allSeasonLeagues.length === 0) return [];
    if (selectedLeagueIds.length === 0) return allSeasonLeagues;

    const selected = new Set(selectedLeagueIds);
    const filtered = allSeasonLeagues.filter((league) => selected.has(league.id));
    return filtered.length > 0 ? filtered : allSeasonLeagues;
  }, [allSeasonLeagues, selectedLeagueIds]);

  const selectedLeague = useMemo(
    () => visibleLeagues.find((league) => league.id === selectedLeagueId) ?? null,
    [selectedLeagueId, visibleLeagues],
  );

  useEffect(() => {
    if (isLeaguesLoading) return;

    if (visibleLeagues.length === 0) {
      setSelectedLeagueId('');
      setSelectedDivisionId('');
      setIsLeagueChooserOpen(true);
      return;
    }

    const hasSelectedLeague = selectedLeagueId.length > 0;
    const selectedLeagueStillVisible = selectedLeagueId.length > 0
      && visibleLeagues.some((league) => league.id === selectedLeagueId);

    if (!selectedLeagueStillVisible) {
      if (selectedLeagueIds.length > 0) {
        const fallbackLeague = visibleLeagues[0];
        setSelectedLeagueId(fallbackLeague.id);
        setSelectedDivisionId(fallbackLeague.divisions[0]?.id ?? '');
        setIsLeagueChooserOpen(false);
      } else {
        setSelectedLeagueId('');
        setSelectedDivisionId('');
        setIsLeagueChooserOpen(true);
      }
      return;
    }

    if (!hasSelectedLeague) {
      setIsLeagueChooserOpen(true);
      return;
    }

    const currentLeague = visibleLeagues.find((league) => league.id === selectedLeagueId);
    if (!currentLeague) return;

    const hasSelectedDivision = currentLeague.divisions.some((division: DivisionData) => division.id === selectedDivisionId);
    if (!hasSelectedDivision) {
      setSelectedDivisionId(currentLeague.divisions[0]?.id ?? '');
    }
  }, [isLeaguesLoading, selectedDivisionId, selectedLeagueId, selectedLeagueIds.length, visibleLeagues]);

  useEffect(() => {
    if (selectedLeagueId) {
      localStorage.setItem(CURRENT_LEAGUE_ID_KEY, selectedLeagueId);
    }
    if (selectedDivisionId) {
      localStorage.setItem(CURRENT_DIVISION_ID_KEY, selectedDivisionId);
    }
  }, [selectedLeagueId, selectedDivisionId]);

  const standingsQuery = useStandingsQuery(selectedDivisionId, Boolean(selectedDivisionId));
  const standings = standingsQuery.data ?? null;
  const isStandingsLoading = standingsQuery.isLoading;
  const standingsError = getQueryError(standingsQuery.error);

  const leagueSnapshotQuery = useLeagueSnapshotQuery(selectedLeague?.id ?? '', Boolean(selectedLeague));

  const leagueSnapshot = leagueSnapshotQuery.data ?? null;
  const isLeagueSnapshotLoading = leagueSnapshotQuery.isLoading;
  const leagueSnapshotError = getQueryError(leagueSnapshotQuery.error);

  const standingsRows = standings?.data ?? [];
  const standingsSourceUrl = standings?.source_url ?? null;
  const selectedDivisionName = useMemo(
    () => selectedLeague?.divisions.find((division) => division.id === selectedDivisionId)?.name ?? null,
    [selectedLeague, selectedDivisionId],
  );
  const shouldShowAllLeagues = !selectedLeague || isLeagueChooserOpen;
  const selectedLeagueCount = visibleLeagues.length;
  const selectedLeagueCountLabel = `${selectedLeagueCount} league${selectedLeagueCount === 1 ? '' : 's'}`;
  const canToggleLeagueList = Boolean(selectedLeague);

  return (
    <>
      <HeroCard
        eyebrow="Leagues"
        title={selectedLeague?.name ?? 'Choose a league'}
        summary={selectedDivisionName ?? 'Select a league to view divisions and standings.'}
        actions={visibleLeagues.length > 0 ? (
          <button
            type="button"
            className="tt-btn tt-btn--sm tt-btn--outline"
            aria-expanded={shouldShowAllLeagues}
            disabled={!canToggleLeagueList}
            onClick={() => { if (canToggleLeagueList) setIsLeagueChooserOpen((c) => !c); }}
          >
            <span>{selectedLeagueCountLabel}</span>
            <i className={shouldShowAllLeagues ? 'fa fa-chevron-up' : 'fa fa-chevron-down'} />
          </button>
        ) : null}
      >
        {leaguesError ? <p className="tt-section-meta tt-section-meta--error">Failed to load leagues: {leaguesError}</p> : null}
        {isLeaguesLoading ? (
          <div className="tt-skeleton-list">
            <div className="tt-skeleton-list-copy">
              <SkeletonBlock className="tt-skeleton-text" />
              <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
            </div>
          </div>
        ) : null}
        {!isLeaguesLoading && visibleLeagues.length === 0 ? (
          <p className="tt-section-meta">No leagues are available for the active season.</p>
        ) : null}
      </HeroCard>

      {visibleLeagues.length > 0 ? (
        <>
          {shouldShowAllLeagues ? (
            <section className="tt-player-section" aria-labelledby="tt-league-list-title">
              <SectionHeader title="Active Leagues" note={selectedLeagueCountLabel} />
              <List divider="hairline">
                {visibleLeagues.map((league) => (
                  <ListItem
                    key={league.id}
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                    title={league.name}
                    subtitle={`${league.divisions.length} division${league.divisions.length === 1 ? '' : 's'}`}
                    active={selectedLeagueId === league.id}
                    onClick={() => {
                      setSelectedLeagueId(league.id);
                      setSelectedDivisionId(league.divisions[0]?.id ?? '');
                      setIsLeagueChooserOpen(false);
                    }}
                    trailing={<Pill tone={selectedLeagueId === league.id ? 'accent' : 'neutral'}>{selectedLeagueId === league.id ? 'Selected' : 'View'}</Pill>}
                    hideChevron
                  />
                ))}
              </List>
            </section>
          ) : null}

          <section className="tt-player-section" aria-labelledby="tt-league-snapshot-title">
            <SectionHeader title="League Snapshot" note={selectedLeague?.name ?? 'Selected League'} />
            {isLeagueSnapshotLoading ? (
              <>
                <div className="tt-league-summary-grid">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="tt-league-kpi">
                      <SkeletonBlock className="tt-skeleton-stat" />
                      <SkeletonBlock className="tt-skeleton-text mt-2" />
                    </div>
                  ))}
                </div>
                <div className="mt-3"><SkeletonList rows={4} /></div>
              </>
            ) : leagueSnapshotError ? (
              <ErrorState message={leagueSnapshotError} />
            ) : !leagueSnapshot ? (
              <EmptyState iconClassName="fa fa-chart-bar" title="Snapshot unavailable" message="Snapshot is not available for this league yet." />
            ) : (
              <>
                <div className="tt-league-summary-grid">
                  <div className="tt-league-kpi"><strong className="tt-league-kpi-value">{leagueSnapshot.totals.divisions}</strong><span>Divisions</span></div>
                  <div className="tt-league-kpi"><strong className="tt-league-kpi-value">{leagueSnapshot.totals.teams}</strong><span>Teams</span></div>
                  <div className="tt-league-kpi"><strong className="tt-league-kpi-value">{leagueSnapshot.totals.players}</strong><span>Players</span></div>
                  <div className="tt-league-kpi"><strong className="tt-league-kpi-value">{leagueSnapshot.totals.matches}</strong><span>Matches</span></div>
                </div>
                <List divider="hairline">
                  {leagueSnapshot.divisions.map((division) => {
                    const isActiveDivision = selectedDivisionId === division.divisionId;
                    return (
                      <ListItem
                        key={division.divisionId}
                        title={division.divisionName}
                        subtitle={`${division.players} players · ${division.teams} teams · ${division.matches} matches played`}
                        active={isActiveDivision}
                        onClick={() => setSelectedDivisionId(division.divisionId)}
                        trailing={<Pill tone={isActiveDivision ? 'accent' : 'neutral'}>{isActiveDivision ? 'Selected' : 'View'}</Pill>}
                        hideChevron
                      />
                    );
                  })}
                </List>
              </>
            )}
          </section>

          <section className="tt-player-section" aria-labelledby="tt-league-standings-title">
            <SectionHeader
              title="Standings"
              note={selectedDivisionName ?? 'League Table'}
              action={standingsSourceUrl ? (
                <ExternalLinkButton href={standingsSourceUrl} aria-label="Open source standings" iconClassName="fa fa-globe" />
              ) : null}
            />
            {isStandingsLoading ? (
              <div className="mt-3"><SkeletonList rows={5} /></div>
            ) : standingsError ? (
              <ErrorState message={standingsError} />
            ) : standingsRows.length === 0 ? (
              <EmptyState iconClassName="fa fa-table" title="No standings yet" message="Standings aren't available for this division yet." />
            ) : (
              <List divider="hairline">
                {standingsRows.map((row: StandingsRow) => (
                  <ListItem
                    key={row.team_id}
                    leading={<span className="tt-rank-badge">{row.position}</span>}
                    title={row.team_name}
                    subtitle={formatRecord({ wins: row.won, losses: row.lost, draws: row.drawn ?? 0, played: row.played })}
                    onClick={() => navigateInTab('leagues', `team/${row.team_id}`)}
                    trailing={<Pill tone="accent">{row.points} pts</Pill>}
                    hideChevron
                  />
                ))}
              </List>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
